---
sidebar_position: 5
---

# Multiple EKS clusters

The recommended production topology separates the **control cluster** (where Platz
itself runs) from one or more **deployment clusters** (where your workloads actually
run). Platz installs once into the control cluster and drives deployments into every
cluster it's allowed to reach.

This page covers the single-account, multi-cluster case: the control cluster and all
deployment clusters live in **one AWS account**. If your clusters span several accounts,
read this page first and then [Multiple AWS accounts](/docs/guide/install/multi-account),
which only adds the cross-account trust on top of this model.

## Why a separate control cluster

- **Blast radius.** A misbehaving workload on a deployment cluster can't touch the Platz
  control plane, its database credentials, or its OIDC secrets.
- **Lifecycle independence.** You can upgrade, drain, or recreate a deployment cluster
  without taking Platz offline, and vice-versa.
- **Clean RBAC story.** The control cluster holds the powerful identities; deployment
  clusters only ever grant access _to_ that identity.

See [Security considerations](/docs/guide/install/security) for the full rationale.

## How it works

```
┌───────────── Control cluster (account 111122223333) ─────────────┐
│  namespace: platz                                                 │
│  api · frontend · k8s-agent (provider: eks) · chart-discovery     │
│        resource-sync · status-updates                             │
│                         │                                         │
│                         │ 1. discover: eks:ListClusters /          │
│                         │    DescribeCluster across all regions    │
│                         │ 2. deploy: spawn a helm pod here that     │
│                         │    runs `aws eks get-token` and helm      │
│                         ▼    against the target cluster's API       │
└───────────────────────┬───────────────────────┬──────────────────┘
                        │                       │
            ┌───────────▼──────────┐ ┌──────────▼───────────┐
            │ Deployment cluster A │ │ Deployment cluster B │
            │ (same account)       │ │ (same account)       │
            │ access entry maps    │ │ access entry maps    │
            │ the k8s-agent IAM    │ │ the k8s-agent IAM    │
            │ role → cluster-admin │ │ role → cluster-admin │
            └──────────────────────┘ └──────────────────────┘
```

Two things make this work:

1. **Discovery (AWS API).** The `k8s-agent` instance runs with `provider: eks` and an
   IRSA role that allows `ec2:DescribeRegions`, `eks:ListClusters`, and
   `eks:DescribeCluster`. It enumerates every region and registers every EKS cluster it
   finds by ARN. The IAM role created by the `k8s-agent-role` Terraform submodule grants
   exactly these permissions (plus `AmazonEC2ContainerRegistryReadOnly`).

2. **Connection (Kubernetes RBAC).** Discovering a cluster is not the same as being able
   to deploy into it. To actually run helm against a deployment cluster, the agent's IAM
   identity must be authorized in _that cluster's_ Kubernetes RBAC. The agent builds a
   kubeconfig whose user runs `aws eks get-token --cluster-name <name>`, so it
   authenticates to the deployment cluster's API server **as its own IAM role**. You
   authorize that role with an EKS **access entry** (or an `aws-auth` ConfigMap entry on
   older clusters).

The control cluster's own deployments work out of the box because the chart binds the
`platz-k8s-agent-<name>` ServiceAccount to `cluster-admin` locally. The extra work for a
multi-cluster setup is wiring access into the _other_ clusters.

## Step 1 — Install Platz in the control cluster

Install exactly as in [Single EKS cluster](/docs/guide/install/single-eks), but use the
`eks` provider so the agent discovers clusters across the account rather than only
managing the one it runs in:

```yaml
k8sAgent:
  instances:
    - name: default
      provider: eks
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: arn:aws:iam::111122223333:role/platz-k8s-agent-default
```

With Terraform, this is the `k8s_agents = [module.platz_k8s_agent_role]` wiring shown on
the [Terraform](/docs/guide/install/terraform) page — the module both creates the IAM
role and annotates the ServiceAccount.

## Step 2 — Authorize the agent on each deployment cluster

For every deployment cluster, grant the k8s-agent IAM role admin access via an EKS access
entry. With the AWS CLI:

```bash
AGENT_ROLE_ARN=arn:aws:iam::111122223333:role/platz-k8s-agent-default

aws eks create-access-entry \
  --cluster-name deployment-cluster-a \
  --principal-arn "$AGENT_ROLE_ARN" \
  --type STANDARD

aws eks associate-access-policy \
  --cluster-name deployment-cluster-a \
  --principal-arn "$AGENT_ROLE_ARN" \
  --access-scope type=cluster \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy
```

Or with `terraform-aws-eks`:

```hcl
access_entries = {
  platz_agent = {
    principal_arn = module.platz_k8s_agent_role.iam_role_arn
    policy_associations = {
      admin = {
        policy_arn   = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
        access_scope = { type = "cluster" }
      }
    }
  }
}
```

`AmazonEKSClusterAdminPolicy` (cluster-admin) is the simplest mapping and matches what
Platz needs in practice — it installs charts, creates namespaces, and reads resource
state across the cluster. If your security posture requires least privilege, you can map
a narrower ClusterRole instead; just be aware that an under-scoped role will surface as
failed tasks with permission errors in the UI.

> On clusters still using the `aws-auth` ConfigMap authentication mode, add a `mapRoles`
> entry for `$AGENT_ROLE_ARN` pointing at `system:masters` (or a custom group bound to a
> ClusterRole) instead of an access entry.

## Step 3 — Attach clusters to envs

Once the agent's next discovery cycle runs (or you restart the agent pod), every cluster
it can see appears at `/admin/clusters`. For each one:

1. Open the cluster, confirm its health check is green (`is_ok`). A red check usually
   means the access entry from Step 2 is missing or wrong.
2. Assign it to an [env](/docs/guide/envs/clusters). An env groups clusters and the people
   allowed to deploy to them — production clusters in one env, staging in another.
3. Optionally set the per-cluster ingress domain, TLS secret, and Grafana/Loki settings
   (see [Clusters](/docs/guide/admin/clusters)).

A deployment cluster that isn't attached to any env is visible only to site admins and
can't receive deployments from env-level users.

## Multiple regions

Discovery already spans every region in the account, so a single `eks` agent instance
picks up clusters in `us-east-1`, `eu-west-1`, and everywhere else automatically. You do
**not** need one agent instance per region. You only add agent instances when you cross an
AWS **account** boundary — see [Multiple AWS accounts](/docs/guide/install/multi-account).

## Caveats

- **Each cluster needs its own access entry.** Discovery is automatic; authorization is
  not. A freshly created deployment cluster shows up in the UI but its health check fails
  until you add the access entry.
- **The helm pod runs in the control cluster.** Deployments into remote clusters are
  driven from a short-lived pod in the control namespace, not from inside the target
  cluster. Network egress from the control cluster to each deployment cluster's API
  endpoint must be allowed — see [Security considerations](/docs/guide/install/security).
- **Moving a cluster between envs doesn't move its deployments.** It only changes who can
  see and manage them. See the warning on [Clusters](/docs/guide/admin/clusters).

## Where to go next

- [Multiple AWS accounts](/docs/guide/install/multi-account) — extend this model across
  account boundaries with cross-account role trust.
- [Security considerations](/docs/guide/install/security) — why this topology is safer and
  how to lock down the network between clusters.
- [Clusters](/docs/guide/admin/clusters) — per-cluster configuration and the discovery
  lifecycle.
