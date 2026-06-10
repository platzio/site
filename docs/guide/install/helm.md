---
sidebar_position: 1
---

# Installing with Helm

Platz ships as a single Helm chart that installs five backend workers (API, k8s-agent, chart-discovery, resource-sync, status-updates) plus the web frontend. Everything runs in one Kubernetes namespace and connects to:

- A **PostgreSQL** database you bring (the chart no longer bundles a Postgres dependency).
- An **OIDC provider** for user authentication (Auth0, Keycloak, Dex, Google, GitHub via an OIDC bridge — anything that speaks OpenID Connect).
- One or more **Helm OCI registries** that hold the charts users will deploy (ECR and any registry implementing the OCI Distribution Spec are both supported).
- One or more **Kubernetes clusters** that Platz will deploy into. The cluster you install Platz onto is _not_ automatically a deployment target — you register clusters explicitly via the `k8sAgent.instances[]` configuration.

This page walks through a complete install. If you just want to bring Platz up locally on a kind cluster for development, see [platzio/dev](https://github.com/platzio/dev) — it scripts the whole thing with Tilt and an in-cluster Postgres + Dex + OCI registry.

## Prerequisites

Before running `helm install`:

- **A reasonably recent Kubernetes.** The chart adapts its Ingress resources to the cluster: `networking.k8s.io/v1` on Kubernetes 1.19+, `networking.k8s.io/v1beta1` on 1.14–1.18, `extensions/v1beta1` on anything older. Any version covered by EKS (or otherwise still supported upstream) is fine.
- **An Ingress controller** in the target cluster — `ingress-nginx`, AWS Load Balancer Controller, Traefik, etc. The chart can run without ingress (set `ingress.enabled=false`), but production installs almost always want one.
- **`cert-manager`** (optional) if you want the chart to auto-issue a TLS certificate. If you already have a certificate or a wildcard cert-manager `Certificate`, you can skip this.
- **A reachable PostgreSQL database.** The chart treats Postgres as external — managed RDS, Aurora, Cloud SQL, or a self-managed Postgres all work. You'll need a database, a user with full privileges on that database, and network access from the Platz pods. PostgreSQL 17 is the version Platz is built and tested against; older versions back to 12 are likely to work but aren't exercised by CI (see [Database](/docs/guide/install/database)).
- **An OIDC application** configured in your IdP. You'll need a client ID, a client secret, and to allow Platz's redirect URL (`https://<your-platz-host>/auth/google/callback` — the path is `/auth/google/callback` for historical reasons even if you're not using Google).
- **CLI tools:** `kubectl`, `helm` 3.8+ (3.8 added OCI support), and `aws` if you're using IRSA-based ECR access.

## Step 1 — Create the namespace

```bash
kubectl create namespace platzio
```

The rest of this page assumes `platzio` as the namespace name. If you use something else, substitute it in every command and in the `--namespace` flag to `helm`.

## Step 2 — Create the Postgres credentials secret

Platz reads the database credentials from a Kubernetes Secret whose name is configured by `database.secretName` (default: `postgres-creds`). The secret must contain five keys:

| Key          | Example                                               | Notes                                               |
| ------------ | ----------------------------------------------------- | --------------------------------------------------- |
| `PGHOST`     | `platz-db.cluster-abc123.us-east-1.rds.amazonaws.com` | Hostname only. No port, no `postgres://` prefix.    |
| `PGPORT`     | `5432`                                                | Standard libpq env var.                             |
| `PGUSER`     | `platz`                                               | Database user with full privileges on the database. |
| `PGPASSWORD` | `your-password`                                       | Stored as-is in the secret.                         |
| `PGDATABASE` | `platz`                                               | The database name. Platz writes its tables here.    |

```bash
kubectl -n platzio create secret generic postgres-creds \
  --from-literal=PGHOST=db.example.com \
  --from-literal=PGPORT=5432 \
  --from-literal=PGUSER=platz \
  --from-literal=PGPASSWORD='use-something-real' \
  --from-literal=PGDATABASE=platz
```

These five values are injected as environment variables into every Platz pod that talks to the database (the API and all four background workers) — the chart wires each `PG*` key in as an individual env var with a `secretKeyRef`. The backend assembles its connection URL from these five variables. A `DATABASE_URL` environment variable is also honored and takes precedence over the `PG*` variables, but it's a deprecated legacy escape hatch (you'd have to inject it yourself via `extraEnv`) — stick to the secret.

## Step 3 — Create the OIDC config secret

The OIDC client credentials live in their own secret, separate from the database one, so you can rotate them independently. Default secret name: `oidc-config`. Three keys:

| Key            | Example                                 | Notes                                                                                             |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `serverUrl`    | `https://auth.example.com/realms/platz` | The OIDC issuer URL. Platz appends `/.well-known/openid-configuration` to discover the endpoints. |
| `clientId`     | `platz`                                 | OAuth 2.0 client ID.                                                                              |
| `clientSecret` | `your-secret`                           | OAuth 2.0 client secret.                                                                          |

```bash
kubectl -n platzio create secret generic oidc-config \
  --from-literal=serverUrl=https://auth.example.com/realms/platz \
  --from-literal=clientId=platz \
  --from-literal=clientSecret='your-oidc-secret'
```

When configuring your IdP, set the redirect URI to `https://<your-platz-host>/auth/google/callback`. The `/google/` segment is historical — the same callback path is used regardless of provider.

## Step 4 — Add the Helm repo

```bash
helm repo add platzio https://platzio.github.io/helm-charts
helm repo update
```

## Step 5 — Write your values file

Below is a minimum-viable `values.yaml` for an EKS install with ingress, cert-manager, and one bot-of-the-show admin email. Adjust to your environment.

```yaml
# platz-values.yaml
auth:
  adminEmails:
    - admin@example.com

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  rules:
    - host: platz.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - platz.example.com
      secretName: platz-tls

certManager:
  certificate:
    create: true
  issuer:
    create: false # we already have a ClusterIssuer named letsencrypt-prod

k8sAgent:
  instances:
    - name: this-cluster
      provider: local # or `eks` if discovering EKS clusters by IAM
      localContext: "" # empty = use the in-cluster service account

chartDiscovery:
  instances:
    - name: oci
      provider: oci
      oci:
        registryUrl: https://ghcr.io
        pollInterval: 30s
```

Save it as `platz-values.yaml`.

### Required vs optional values

You can get away with very little if you don't care about ingress and TLS:

| Section                    | Required?                             | Why                                                                                                                                                                                                |
| -------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.adminEmails`         | Strongly recommended                  | If empty, no one gets promoted to site admin and the first user to log in will land in a useless inactive state. You can also activate users manually via a SQL update, but this is the easy path. |
| OIDC secret                | Yes                                   | Users can't log in otherwise.                                                                                                                                                                      |
| Postgres secret            | Yes                                   | The API crashes immediately at startup if it can't connect.                                                                                                                                        |
| `k8sAgent.instances`       | At least one entry                    | Without an agent instance, no deployment tasks ever run.                                                                                                                                           |
| `chartDiscovery.instances` | At least one entry, with valid config | Without chart discovery, no charts are ever ingested, and users see an empty list.                                                                                                                 |
| `ingress.enabled`          | Optional                              | If you don't enable it, expose the `platz-platzio-api` and `platz-platzio-frontend` services some other way (NodePort, LoadBalancer, port-forward for testing).                                    |
| `ownUrlOverride`           | Optional                              | If you're skipping ingress entirely, set this to the externally reachable URL — it's the URL Platz uses when constructing OIDC callback redirects and emitting Status feature URLs.                |

## Step 6 — Install

```bash
helm install platz platzio/platzio \
  --namespace platzio \
  --values platz-values.yaml \
  --wait
```

The `--wait` flag blocks until all pods are Ready, which is the right call for a first install. If you're upgrading and your cluster has limited resources, you can drop it.

### What gets created

The chart deploys:

- **`platz-platzio-api`** (Deployment, 1 replica) — the HTTP API and WebSocket endpoint.
- **`platz-platzio-frontend`** (Deployment, 1 replica) — nginx serving the SPA.
- **`platz-platzio-k8s-agent-<name>`** (StatefulSet, 1 replica per `k8sAgent.instances[]` entry) — runs `helm install`/`upgrade` and watches K8s resources.
- **`platz-platzio-chart-discovery-<name>`** (StatefulSet, 1 replica per `chartDiscovery.instances[]` entry) — watches one registry.
- **`platz-platzio-resource-sync`** (Deployment, 1 replica) — reflects K8s resource state into the database.
- **`platz-platzio-status-updates`** (Deployment, 1 replica) — polls deployment status endpoints.
- ServiceAccounts, RBAC rules, Ingress resources, optionally a cert-manager Certificate, optionally a backup CronJob.

The k8s-agent and resource-sync ServiceAccounts get bound to `cluster-admin` by default. This is the simplest setup and works for installs where Platz is also the deploy target. For multi-cluster setups where Platz lives in one cluster and deploys into others, see [Clusters](/docs/guide/admin/clusters) for the IRSA / cross-account configuration.

## Step 7 — Log in for the first time

Open `https://platz.example.com` (or whatever host you put in the ingress). You'll be redirected to your OIDC provider. After login, Platz looks up your email:

- If your email is in `auth.adminEmails`, your user is created with `is_admin=true` and `is_active=true` — you can see the admin section and start configuring envs immediately.
- Otherwise, your user is created with `is_active=false` and you'll see an "Inactive user" message. A site admin needs to activate you from `/admin/users` before you can do anything.

If you're the only admin, take a moment to:

1. Create your first env at `/admin/envs`.
2. Register at least one cluster at `/admin/clusters` (or wait for the k8s-agent to auto-discover EKS clusters if you're in `eks` provider mode).
3. Attach the cluster to the env.
4. Grant yourself env-level admin in the env's user roles.

From there you can deploy charts.

## Common gotchas

**The API pod crashes with "connection refused" to Postgres.**
The five `PG*` keys in `postgres-creds` are wrong, missing, or your Postgres isn't reachable from the namespace. Test with a one-off `kubectl run -it --rm psql --image=postgres:17 -- psql "postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE"` to isolate the issue.

**Users can log in but everything is empty.**
Most likely: no env has been created, or your user has no permissions on any env. Check `/admin/envs`. Auto-add-new-users on the env (off by default) is what gives new users default `User` role; without it, you must add them by hand.

**Chart discovery is running but no charts appear.**
For an `oci` provider, check that `chartDiscovery.instances[].oci.registryUrl` is reachable from the pod and that the registry actually contains artifacts whose config media type is `application/vnd.cncf.helm.config.v1+json` (i.e. they were pushed by `helm push`, not arbitrary OCI blobs). Tail the worker's logs to see what it's seeing.

For an `ecr` provider, the worker is event-driven — it won't backfill historical charts. You need to either re-push the chart, or set up the SQS queue with the right notification rules. See the [Terraform module](/docs/guide/install/terraform).

**OIDC login redirects but lands on a generic error page.**
The most common cause is a mismatched redirect URI in your IdP — make sure it matches `https://<your-platz-host>/auth/google/callback` exactly, including scheme and trailing path. The second most common cause is `ownUrlOverride` being set to the wrong URL when you don't have a TLS ingress; Platz constructs the redirect from `ownUrlOverride` or the first ingress host.

**Pod can't pull the platzio image.**
The images are public on Docker Hub (`platzio/backend`, `platzio/frontend`, `platzio/base`). If you're in an air-gapped environment, mirror them and override `images.backend.repository`, `images.frontend.repository`, and `images.helm.repository`.

## Where to go next

- [Database setup](/docs/guide/install/database) — recommended Postgres flavors, schema migration behavior, backup strategy.
- [Terraform integration](/docs/guide/install/terraform) — the canonical AWS module that wires Platz up with EKS, ECR, SQS, S3, and IRSA.
- [Clusters](/docs/guide/admin/clusters) — registering remote clusters and the cross-account EKS pattern.
- [Authentication](/docs/guide/admin/auth) — deeper coverage of OIDC config, admin promotion, and machine tokens.
