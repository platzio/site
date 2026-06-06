---
sidebar_position: 7
---

# Security considerations

Platz is a control plane with real power: it can install, upgrade, and delete Helm
releases across every cluster you connect to it. This page lays out the trust boundaries,
explains **why splitting the control plane from your workloads makes the system safer**,
and gives concrete advice on locking down the network, IAM, secrets, and bot access.

## The identities Platz holds

Understanding the security model starts with knowing which identities exist and what each
can do.

| Identity                             | Where it lives                                          | Power                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platz-k8s-agent` ServiceAccount     | Control cluster, one per agent instance                 | Bound to `cluster-admin` in the control cluster. Reaches every connected cluster as its IAM identity. **The most powerful identity in the system.**                                              |
| `platz-resource-sync` ServiceAccount | Control cluster                                         | Bound to `cluster-admin` in the control cluster; reads resource state across clusters.                                                                                                           |
| k8s-agent IAM role (IRSA)            | Per AWS account                                         | `ec2:DescribeRegions`, `eks:ListClusters`, `eks:DescribeCluster`, ECR read. Mapped to `cluster-admin` in each deployment cluster's RBAC.                                                         |
| chart-discovery IAM role (IRSA)      | Per ECR account                                         | `sqs:ReceiveMessage`/`DeleteMessage` on its queue, ECR read. No cluster access.                                                                                                                  |
| `platz-creds` token                  | A short-lived Secret in **each deployment's** namespace | A Platz API token scoped to that one deployment (`Identity::Deployment`), refreshed every 20m with a 1h lifetime. Lets a chart call back to Platz to invoke actions or manage child deployments. |
| User / bot tokens                    | Issued from the UI                                      | See [Authentication](/docs/guide/admin/auth). **Note the bot caveat below.**                                                                                                                     |

The headline: the **k8s-agent is effectively cluster-admin on every cluster you connect**.
Everything else in this page is about containing the consequences of that.

## Why multiple clusters are more secure

A [single-cluster install](/docs/guide/install/single-eks) puts the control plane and your
workloads in the same trust domain. That's fine for small or low-risk setups, but
splitting into a [control cluster plus deployment clusters](/docs/guide/install/multi-eks)
— and, further, into [multiple AWS accounts](/docs/guide/install/multi-account) — buys you
real isolation:

- **Blast radius containment.** The Platz database holds connection details and the
  control plane holds OIDC secrets, the JWT signing secret, and `cluster-admin` in its own
  cluster. If a workload is compromised on a deployment cluster, it sits in a _different_
  cluster (and ideally a different account) from those secrets. A compromised pod can't
  read the control plane's Kubernetes secrets or assume its roles.
- **No lateral movement through the control plane.** Deployment clusters trust the agent's
  IAM identity _inbound_; they hold no credentials that reach back into the control cluster
  or other deployment clusters. Compromising one deployment cluster does not hand an
  attacker the others.
- **Account-level guardrails.** With one account per environment you can apply Service
  Control Policies, separate billing/audit, and independent break-glass procedures. The
  control account is the only one that needs the OIDC provider replicated into it.
- **Independent lifecycle and quotas.** You can rotate, drain, or rebuild a deployment
  cluster — or let a team own theirs — without risk to the control plane.

The trade-off is operational complexity (replicated OIDC providers, per-account agent
instances, access entries). For production handling anything sensitive, the isolation is
worth it.

## Securing the network

The agent connects **outbound from the control cluster** to each cluster's Kubernetes API
endpoint and to the AWS EKS/EC2/SQS/ECR APIs. The helm pod runs in the control namespace
and reaches the target cluster's API the same way. Design the network around that flow:

- **Lock down each cluster's API endpoint.** Prefer private EKS API endpoints, and use
  `publicAccessCidrs` to restrict the public endpoint to the control cluster's NAT/egress
  IPs if you must keep it public. The agent needs reachability to the API server, nothing
  more.
- **Don't expose the control plane more than necessary.** Only the API/frontend ingress
  should be public. Put the control cluster's own API endpoint on a private endpoint or a
  tight CIDR allow-list.
- **Keep Postgres private.** The database must be reachable from the Platz pods and
  nowhere else. Put RDS in private subnets with a security group that only admits the
  control cluster's nodes. Never expose it publicly. Enforce TLS by setting
  `PGSSLMODE=require` (or `verify-full`) via `*.extraEnv` — see
  [Database](/docs/guide/install/database).
- **Terminate TLS at the ingress.** Always serve the UI/API over HTTPS — via cert-manager
  or an ACM certificate on an ALB. The OIDC callback and the session cookie depend on it.
- **Restrict egress.** A NetworkPolicy (or security groups) that allows the control
  cluster egress only to the cluster API endpoints, AWS APIs, your OCI/ECR registries, and
  the database limits what a compromised control-plane pod can reach.
- **Cross-account stays on AWS rails.** Cross-account access uses IRSA web-identity
  federation (see [Multiple AWS accounts](/docs/guide/install/multi-account)); there is no
  long-lived shared secret to leak, and the trust is pinned to one ServiceAccount.

## IAM: least privilege

- The k8s-agent IAM role's AWS permissions are already narrow (describe/list EKS, describe
  regions, ECR read). Its _power_ comes from the Kubernetes RBAC mapping, not from IAM.
- **The cluster-admin mapping is the lever to tighten.** Mapping the agent to
  `AmazonEKSClusterAdminPolicy` is the simplest setup and what Platz expects in practice.
  If your posture demands least privilege, map the agent to a narrower ClusterRole instead
  — but expect to iterate: install/upgrade needs broad create/update/delete across the
  namespaces Platz manages, and an under-scoped role surfaces as failed tasks with
  permission errors. Test against a non-production cluster first.
- Scope EKS **access entries** per cluster. Only the clusters you actually want Platz to
  manage should map the agent role.
- Pin the IRSA trust to the exact ServiceAccount (the Terraform modules do this:
  `system:serviceaccount:<ns>:<release>-k8s-agent-<instance>`). Don't widen it to a
  wildcard.

## Secrets

- **Postgres credentials** (`postgres-creds`) and **OIDC client credentials**
  (`oidc-config`) are Kubernetes Secrets in the control namespace. Restrict who can read
  Secrets there; consider a secrets manager / `external-secrets` so they aren't committed
  to values files. Rotate the OIDC client secret independently of the database (they're
  separate secrets by design).
- **The JWT signing secret** is generated on first boot and stored in the database
  (`settings` table, key `jwt_secret`). Anyone with write access to that row can mint Platz
  sessions — guard database access accordingly (see the warning on
  [Database](/docs/guide/install/database)).
- **The backup encryption key** (`backup-config` secret, key `encryptionKey`) protects
  your database dumps at rest in S3. Treat it like the database password; if it leaks, so
  do your backups.
- **`platz-creds` in deployment namespaces** is short-lived by design (1h token, refreshed
  every 20m). Anything that can read Secrets in a deployment's namespace can use that token
  as the deployment until it expires — another reason to keep deployment-namespace RBAC
  tight on shared clusters.

## Authentication and authorization

- Platz has **no local user store** — authentication is entirely delegated to your OIDC
  provider. Enforce MFA, session policy, and account lifecycle _there_. See
  [Authentication](/docs/guide/admin/auth).
- Browser sessions are 7-day JWTs; deactivating a user is honored on the _next request_
  (Platz re-checks `is_active` every request), so deactivation is effectively immediate.
- **Bot tokens are powerful — treat them as privileged.** Platz does not yet scope bots by
  env or deployment permissions: any valid bot token currently passes the
  deployment-maintainer check (the per-bot permission model is a known TODO in the backend).
  In practice a bot token can act as a maintainer on deployments. Issue them sparingly,
  store them in a secrets manager, scope blast radius at the network/registry level, and
  rotate/revoke promptly. Prefer per-deployment `platz-creds` (automatically scoped) for
  chart-to-Platz callbacks rather than handing a chart a bot token.

## A pragmatic baseline

For a production install handling anything sensitive:

1. Control cluster separate from deployment clusters; ideally one AWS account per
   environment.
2. Private (or tightly CIDR-restricted) EKS API endpoints everywhere.
3. RDS in private subnets, TLS enforced, reachable only from the control cluster.
4. HTTPS-only ingress, OIDC with MFA, a short IdP session policy.
5. OIDC/Postgres/backup secrets in a secrets manager, not in values files.
6. Bot tokens minimized and rotated; per-deployment `platz-creds` preferred for automation
   inside charts.

## Where to go next

- [Multiple EKS clusters](/docs/guide/install/multi-eks) — the isolation topology this page
  argues for.
- [Multiple AWS accounts](/docs/guide/install/multi-account) — cross-account trust without
  shared secrets.
- [Authentication](/docs/guide/admin/auth) — OIDC, sessions, and machine tokens in detail.
- [Database](/docs/guide/install/database) — keeping the datastore private and backed up.
