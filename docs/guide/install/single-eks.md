---
sidebar_position: 4
---

# Single EKS cluster

This guide walks through the simplest production-grade topology: **Platz runs in one
Amazon EKS cluster and deploys workloads into that same cluster.** Everything — the
API, the workers, and the deployments users create — lives in a single cluster and a
single AWS account.

This is the right starting point for most teams. When you outgrow it — because you want
to isolate production from the control plane, or you have clusters in several regions or
accounts — move on to [Multiple EKS clusters](/docs/guide/install/multi-eks) and
[Multiple AWS accounts](/docs/guide/install/multi-account). Read
[Security considerations](/docs/guide/install/security) before you decide a single
cluster is good enough for your threat model.

## Topology

```
┌─────────────────────────── EKS cluster (one AWS account) ───────────────────────────┐
│                                                                                      │
│   namespace: platz                                                                   │
│   ┌────────────┐  ┌────────────┐  ┌─────────────────┐  ┌───────────────┐             │
│   │ api +      │  │ k8s-agent  │  │ chart-discovery │  │ resource-sync │  ...        │
│   │ frontend   │  │ (local|eks)│  │ (ecr|oci)       │  │ status-updates│             │
│   └────────────┘  └─────┬──────┘  └────────┬────────┘  └───────────────┘             │
│                         │ helm install/upgrade        ▲ reflects resources           │
│                         ▼                             │                              │
│   namespace: my-app-1   namespace: my-app-2   ...  (one namespace per deployment)    │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The `platz-k8s-agent` worker spawns a short-lived helm pod **inside the control
namespace** for every install/upgrade, and that pod talks to the cluster's own API
server. Because Platz is deploying into the cluster it already lives in, there is no
cross-cluster authentication to wire up — the in-cluster ServiceAccount is enough.

## Prerequisites

- An **EKS cluster** (any version EKS currently supports). If you don't have one,
  `terraform-aws-eks` or `eksctl` both work; Platz doesn't care how it was created.
- An **IngressClass** backed by a controller — `ingress-nginx` or the AWS Load Balancer
  Controller are the common choices.
- **`cert-manager`** if you want automatic TLS, or an ACM certificate on an ALB if you
  prefer to terminate TLS at the load balancer.
- A **PostgreSQL database**. RDS for PostgreSQL is the production default; see
  [Database](/docs/guide/install/database) for sizing. For a quick start the Terraform
  module can install an in-cluster Postgres for you (not recommended for production).
- A **Helm OCI registry** for the charts users will deploy — an ECR registry in the same
  account is the natural fit here.
- An **OIDC provider** for user login (Auth0, Keycloak, Dex, Google, …).

## Choosing the k8s-agent provider

For a single cluster you have two ways to let the agent manage the cluster it runs in.
Both are valid; pick based on how you provision AWS access.

| Provider | How the cluster is registered                                                                                              | AWS IAM needed for cluster access | When to use                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `local`  | The agent registers the cluster it runs in, using the pod's in-cluster ServiceAccount (`provider_id` = `local:<context>`). | None                              | Simplest. The agent only ever manages its own cluster.                       |
| `eks`    | The agent calls `eks:ListClusters` / `eks:DescribeCluster` across the account's regions and discovers the cluster by ARN.  | IRSA role (see below)             | You want the same install to grow into multi-cluster later without reconfig. |

With `provider: local`, the agent uses the chart's built-in `cluster-admin`
ClusterRoleBinding (it binds the `platz-k8s-agent-<name>` and `platz-resource-sync`
ServiceAccounts to `cluster-admin`), so no AWS IAM is required just to deploy. With
`provider: eks`, the agent connects to the discovered cluster's API server using
`aws eks get-token`, so the agent's IAM identity must also be authorized in the
cluster's RBAC (it already is, via the same in-cluster binding, as long as the
cluster maps the IRSA role — see [Security considerations](/docs/guide/install/security)).

This guide shows the `local` path, which is the least moving parts for a single cluster.

## Option A — Terraform (recommended)

The [`terraform-aws-platzio`](https://github.com/platzio/terraform-aws-platzio) module
provisions the AWS-side plumbing (the chart-discovery SQS queue and IAM roles, the
k8s-agent IAM role, and the Helm release) in one shot. See
[Installing with Terraform](/docs/guide/install/terraform) for the full reference; the
single-cluster shape looks like this:

```hcl
# The OIDC role for ECR chart discovery, deployed in the account that holds your ECR repos.
module "platz_chart_discovery" {
  source = "github.com/platzio/terraform-aws-platzio//modules/chart-discovery?ref=v0.7.0-beta.4"

  irsa_oidc_provider = local.eks_oidc_provider # e.g. oidc.eks.us-east-1.amazonaws.com/id/ABC123
  irsa_oidc_arn      = local.eks_oidc_arn
}

# The IAM role the k8s-agent uses to discover and reach EKS clusters.
module "platz_k8s_agent_role" {
  source = "github.com/platzio/terraform-aws-platzio//modules/k8s-agent-role?ref=v0.7.0-beta.4"

  instance_name      = "default"
  irsa_oidc_provider = local.eks_oidc_provider
  irsa_oidc_arn      = local.eks_oidc_arn
}

module "platz" {
  source = "github.com/platzio/terraform-aws-platzio//modules/main?ref=v0.7.0-beta.4"

  k8s_cluster_name = "prod-us-east-1"

  ingress = {
    host       = "platz.example.com"
    class_name = "nginx"
    tls = {
      secret_name        = "platz-tls"
      create_certificate = true
      create_issuer      = false
      issuer_email       = "ops@example.com"
    }
  }

  # OIDC credentials are read from SSM Parameter Store, not passed inline.
  oidc_ssm_params = {
    server_url    = "/platz/oidc/server-url"
    client_id     = "/platz/oidc/client-id"
    client_secret = "/platz/oidc/client-secret"
  }

  admin_emails = ["admin@example.com"]

  chart_discovery = [module.platz_chart_discovery]
  k8s_agents      = [module.platz_k8s_agent_role]
}
```

By default (`install_database = true`) the module installs an in-cluster Postgres for
you. For production, set `install_database = false` and pass `database_config` pointing
at RDS.

## Option B — Helm directly

If you'd rather not use Terraform, follow [Installing with Helm](/docs/guide/install/helm)
and use a values file with a single `local` agent instance and your ECR registry:

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
    - hosts: [platz.example.com]
      secretName: platz-tls

certManager:
  certificate:
    create: true

k8sAgent:
  instances:
    - name: default
      provider: local # manage the cluster we run in via the in-cluster ServiceAccount
      localContext: "" # empty = use the pod's ServiceAccount

chartDiscovery:
  instances:
    - name: ecr
      provider: ecr
      ecrEvents:
        queueName: platz-chart-discovery
        regionName: us-east-1
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/platz-chart-discovery-default
```

You still need the Postgres secret and the OIDC secret from the
[Helm install](/docs/guide/install/helm) page, plus the SQS queue and IAM role that the
`chart-discovery` Terraform submodule (or your own resources) provides.

## After install

1. Log in as one of your `adminEmails`.
2. Create an env at `/admin/envs`.
3. The agent registers the cluster within one refresh cycle (`K8S_REFRESH_INTERVAL`,
   default `1h`; restart the agent pod to force it immediately). Attach the cluster to
   your env at `/admin/clusters`.
4. Push a chart to ECR — it appears in the UI within seconds.
5. Create your first deployment.

See [Clusters](/docs/guide/admin/clusters) for the per-cluster settings (ingress domain,
Grafana/Loki, env assignment).

## Where to go next

- [Multiple EKS clusters](/docs/guide/install/multi-eks) — split the control plane from
  the clusters that run your workloads.
- [Security considerations](/docs/guide/install/security) — what a single cluster does and
  doesn't isolate.
- [Database](/docs/guide/install/database) — production Postgres sizing and backups.
