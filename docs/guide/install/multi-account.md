---
sidebar_position: 6
---

# Multiple AWS accounts

When your EKS clusters are spread across several AWS accounts — a common setup where each
team or environment owns its own account — Platz still runs in a single **control
account** and reaches into each **tenant account** to manage its clusters.

This page builds directly on [Multiple EKS clusters](/docs/guide/install/multi-eks). The
only thing that changes across an account boundary is **how the k8s-agent's identity is
trusted** in the tenant account. Read the multi-cluster page first; the discovery,
access-entry, and env-attachment steps are identical per cluster once the trust is in
place.

## How cross-account trust actually works

Platz does **not** chain `sts:AssumeRole` from a control-account role into a tenant-account
role. Instead, each k8s-agent pod authenticates directly into a role in the tenant account
using **IRSA / web-identity federation** — the same mechanism it uses in its own account,
pointed at a different account's role.

The trick that makes this possible: the IAM role in the tenant account trusts the
**control cluster's IRSA OIDC provider**, not the tenant account's own EKS OIDC provider.
EKS clusters expose a public OIDC issuer, and any account can register that issuer as an
OpenID Connect identity provider. So you replicate the control cluster's OIDC provider
into each tenant account, and create a k8s-agent role there whose trust policy says
"allow `system:serviceaccount:platz:platz-k8s-agent-<instance>` from the control cluster's
issuer to assume me via `AssumeRoleWithWebIdentity`".

```
Control account 1111…                         Tenant account 2222…
┌──────────────────────────────┐              ┌──────────────────────────────────────┐
│ EKS control cluster          │              │ aws_iam_openid_connect_provider        │
│  issuer: oidc.eks.us-east-1   │── mirror ──▶ │   (same url + thumbprint as control)   │
│          …/id/ABC123          │              │                                        │
│                              │              │ role: platz-k8s-agent-tenant           │
│ pod: platz-k8s-agent-tenant   │── web ──────▶│   trust: AssumeRoleWithWebIdentity for │
│  SA token (OIDC)             │  identity    │     system:serviceaccount:platz:       │
│                              │  federation  │       platz-k8s-agent-tenant           │
└──────────────────────────────┘              │   perms: eks:List/DescribeCluster, …   │
                                               └──────────────────────────────────────┘
```

Each tenant account gets its **own k8s-agent instance** — a separate StatefulSet, pod,
ServiceAccount, and IAM role — because one agent identity can hold credentials for one
account at a time. The instance name flows all the way through: it names the StatefulSet
in Kubernetes and the ServiceAccount that the tenant-account role's trust policy pins.

## Step 1 — Replicate the control cluster's OIDC provider into each tenant account

In **each tenant account**, register the control cluster's OIDC issuer as an identity
provider. You need the control cluster's issuer URL and its TLS thumbprint:

```hcl
# Run this in the TENANT account's provider configuration.
resource "aws_iam_openid_connect_provider" "platz_control_cluster" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [var.control_cluster_irsa_thumbprint]
  url             = var.control_cluster_irsa_issuer_url # https://oidc.eks.us-east-1.amazonaws.com/id/ABC123
}
```

The issuer URL is the control cluster's `identity.oidc.issuer`
(`aws eks describe-cluster --name <control> --query cluster.identity.oidc.issuer`).

## Step 2 — Create a k8s-agent role in each tenant account

Use the `k8s-agent-role` submodule, but point its `irsa_oidc_provider` / `irsa_oidc_arn`
at the **provider you just created in the tenant account** (which mirrors the control
cluster), not at the tenant cluster's own OIDC provider:

```hcl
# In the TENANT account:
module "platz_k8s_agent_role" {
  source = "github.com/platzio/terraform-aws-platzio//modules/k8s-agent-role?ref=v0.7.0-beta.4"

  # Must be unique across all agent instances — it names the StatefulSet/ServiceAccount.
  instance_name = "tenant-prod"

  irsa_oidc_provider = replace(
    aws_iam_openid_connect_provider.platz_control_cluster.url, "https://", ""
  )
  irsa_oidc_arn = aws_iam_openid_connect_provider.platz_control_cluster.arn

  # If you installed Platz in a non-default namespace or release name, pass them here so
  # the trust policy pins the right ServiceAccount:
  # k8s_namespace     = "platz"
  # helm_release_name = "platz"
}
```

The module's trust policy ends up allowing
`system:serviceaccount:<namespace>:<release>-k8s-agent-<instance_name>` from the control
cluster's issuer — so the `instance_name`, `k8s_namespace`, and `helm_release_name` here
**must match** the values you use when installing Platz in the control cluster.

## Step 3 — Add one agent instance per tenant account to the control install

Pass one per-tenant-account role into the `main` module's `k8s_agents` list. **There is no
agent instance for the control account itself** — the control cluster runs Platz and is
deliberately not a deployment target (that separation is the whole point of this topology;
see [Security considerations](/docs/guide/install/security)). The control cluster never
gets discovered or attached to an env, so no workloads land on the control plane.

```hcl
# In the CONTROL account / Platz install:
module "platz" {
  source = "github.com/platzio/terraform-aws-platzio//modules/main?ref=v0.7.0-beta.4"

  k8s_cluster_name = "control-cluster"
  # ... ingress, oidc_ssm_params, admin_emails ...

  # One entry per TENANT account — not the control account.
  k8s_agents = [
    module.platz_k8s_agent_role_tenant_prod,    # account 2222… (provider-aliased / remote-state outputs)
    module.platz_k8s_agent_role_tenant_staging, # account 3333…
  ]
}
```

Or, with a plain Helm values file, one instance per tenant account, each annotated with
that account's role ARN:

```yaml
k8sAgent:
  instances:
    - name: tenant-prod # account 2222…
      provider: eks
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: arn:aws:iam::222233334444:role/platz-k8s-agent-tenant-prod
    - name: tenant-staging # account 3333…
      provider: eks
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: arn:aws:iam::333344445555:role/platz-k8s-agent-tenant-staging
```

Each instance is its own StatefulSet and discovers EKS clusters across **all regions** of
its account. So a single tenant instance covers every region in that account — you split
by account, not by region.

> **What if the control account also hosts workload clusters?** Keep them out of the
> control account if you can — colocating workload clusters with the control plane weakens
> the isolation. If you genuinely must, add a separate agent instance scoped to the
> control account's _workload_ clusters and simply never attach the control cluster itself
> to an env (or set its **Ignore** flag). The control cluster being discovered is harmless;
> the thing to avoid is attaching it to an env and deploying onto it.

## Step 4 — Authorize each agent in each cluster's RBAC

This is identical to [Step 2 of the multi-cluster guide](/docs/guide/install/multi-eks):
for every deployment cluster in a tenant account, add an EKS access entry mapping **that
account's** k8s-agent role to `AmazonEKSClusterAdminPolicy` (or a narrower ClusterRole).
The principal is the tenant-account role ARN, applied on the tenant-account cluster.

## Step 5 — Chart discovery across accounts

If your ECR registries also live in different accounts, deploy the `chart-discovery`
submodule **in each account that holds ECR repos**, with a distinct `instance_name`, and
pass them all to the `main` module's `chart_discovery` list. Like the k8s-agent role, each
chart-discovery role trusts the control cluster's replicated OIDC provider via
`AssumeRoleWithWebIdentity`. A single ECR account needs only one chart-discovery instance.

```hcl
chart_discovery = [
  module.platz_chart_discovery_account_a,
  module.platz_chart_discovery_account_b,
]
```

## Verifying the wiring

- The agent pod logs should show successful `eks:ListClusters` calls in the tenant
  account's regions. A `not authorized to perform sts:AssumeRoleWithWebIdentity` error
  means the tenant-account OIDC provider URL/thumbprint or the trust policy's
  `instance_name`/namespace don't match the control install.
- Clusters that list (discovery works) but fail their health check mean the IAM identity
  isn't yet mapped in that cluster's RBAC (Step 4).

## Where to go next

- [Security considerations](/docs/guide/install/security) — the trust boundaries this
  topology creates, and how to keep the network between accounts tight.
- [Multiple EKS clusters](/docs/guide/install/multi-eks) — the per-cluster mechanics that
  this page reuses.
- [Installing with Terraform](/docs/guide/install/terraform) — the module reference for
  `k8s-agent-role`, `chart-discovery`, and `main`.
