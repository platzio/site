---
sidebar_position: 2
---

# Clusters

A **cluster** in Platz is a registered Kubernetes cluster that Platz can deploy into. Clusters are discovered (or registered manually) by the `platz-k8s-agent` worker and managed at `/admin/clusters` by site admins.

This page covers how clusters appear in Platz, the two discovery modes (`eks` and `local`), the per-cluster settings (ingress, Grafana, env assignment, ignore flag), and the cross-account EKS pattern.

## How clusters appear

`platz-k8s-agent` runs as one or more StatefulSets (one per `k8sAgent.instances[]` entry in your Helm values). Each instance polls for clusters on a schedule controlled by `K8S_REFRESH_INTERVAL` (default `1h`). When it finds a cluster, it upserts a row into the `k8s_clusters` table keyed by the cluster's `provider_id`:

- For EKS clusters, the `provider_id` is the cluster's ARN.
- For local clusters, the `provider_id` is `local:<context-name>`.

Once a cluster appears in the database, the UI shows it at `/admin/clusters`. The first time a cluster is seen, it's not attached to any env — a site admin needs to attach it manually.

## Discovery modes

Each `k8sAgent.instances[]` entry has a `provider` field that selects how clusters are discovered. Two modes are supported.

### `eks`

The default mode for production. The agent uses the AWS SDK to:

1. List all AWS regions in the account.
2. In each region, list all EKS clusters.
3. For each cluster, fetch metadata (name, ARN, endpoint, status).
4. Upsert a row into `k8s_clusters`.

Requires AWS credentials. With IRSA, the pod's ServiceAccount is annotated with `eks.amazonaws.com/role-arn`, and the role has the necessary `eks:List*` / `eks:Describe*` permissions.

For cross-account discovery (Platz lives in account A, EKS clusters live in accounts B, C, D), use one `k8sAgent.instances[]` entry per tenant account, each annotated with the role ARN in that account. See [Cross-account EKS](#cross-account-eks) below.

### `local`

For single-cluster deployments where Platz manages just the cluster it's installed into. The agent reads the kubeconfig context specified by `PLATZ_LOCAL_CONTEXT` (or the current-context if unset) and registers a single cluster with `provider_id = local:<context-name>`.

When the agent runs in-cluster with no kubeconfig file, the kube client falls back to the pod's ServiceAccount credentials, and `PLATZ_LOCAL_CONTEXT` can be empty — the cluster is registered as the in-cluster cluster. This is what the [platzio/dev](https://github.com/platzio/dev) Tilt setup uses.

## The cluster detail page

`/admin/clusters/<id>` (site admins only) has several cards.

### Cluster info

Shows the cluster's name, region, provider, ARN/context, status, and last-seen timestamp. The status combines:

- `is_ok` — set by the agent's periodic health check (a kube API ping).
- `not_ok_reason` — populated when `is_ok` flips to false. Surfaces the error verbatim.

A cluster that fails its health check stays in the UI but is excluded from deployment cluster pickers. If the failure is intentional (cluster decommissioned), set the **Ignore** flag (see below) to skip future health checks.

### Cluster Env Assignment

The single most important setting: which env this cluster belongs to.

- **Set Cluster Env** — when the cluster isn't yet attached. Pick an env from the dropdown.
- **Change Cluster Env** — moves the cluster to a different env. ⚠️ This does **not** uninstall existing deployments. They keep running, but they now belong to the new env's user list. Move carefully.
- **Detach** — clears the env assignment. Existing deployments stay running but become invisible to env-level users (only site admins see them).

### Ingress Settings

Per-cluster ingress configuration that feeds the [Standard Ingress feature](/docs/guide/chart-ext/features#ingress). Three fields:

| Field                     | Example             | What it does                                                                                                                                                                                              |
| ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingress_domain`          | `platz.example.com` | The base domain. Deployment hostnames are constructed as `<deployment>.<domain>` or `<kind>-<deployment>.<domain>` (controlled by the chart's `hostname_format`).                                         |
| `ingress_class`           | `nginx`             | The `ingressClassName` to set on the auto-generated Ingress resource. Needs to match a controller installed in that cluster.                                                                              |
| `ingress_tls_secret_name` | `letsencrypt-prod`  | The name of the TLS secret to reference. The secret must exist in the _deployment's_ namespace — usually managed by cert-manager via a wildcard `Certificate` plus `kubed`-style replication, or by hand. |

All three are optional. If `ingress_domain` is unset, the Standard Ingress feature is a no-op on that cluster — even charts that enable it won't get an ingress. If `ingress_tls_secret_name` is unset, the ingress will be HTTP-only.

The fields are independent of the **Platz install's** own ingress. Those are configured at install time via the `ingress` chart values and never appear here.

### Ignore Cluster

A toggle. When on:

- The cluster is excluded from health checks.
- It disappears from deployment cluster pickers.
- Existing deployments on the cluster continue to run, but no new deployments can be created on it.

Use this for clusters that are being decommissioned, or for clusters that are temporarily offline (planned maintenance, region outage) so the UI doesn't flag every deployment as broken.

### Grafana / Loki integration

If you give the cluster a Grafana URL and a Loki datasource name, the deployment Actions menu gains an **Open Logs** entry that opens Grafana with a pre-filled Loki query for the deployment's namespace.

```
Grafana URL:        https://grafana.example.com
Datasource name:    loki-prod-us-east-1
```

The link Platz generates includes the deployment's Kubernetes namespace as a label filter, so users land directly on the deployment's pod logs. See [Logs](/docs/guide/admin/logs) for the URL construction details and how to wire this up with non-Grafana log stacks.

### Deployments on this cluster

A list view of every deployment currently on the cluster. Mostly useful as a sanity check before detaching the cluster from an env — you can see what would be affected.

## Cross-account EKS

The pattern for managing EKS clusters in tenant AWS accounts while running Platz in a control-plane account. Note that cross-account access is **not** a chained `sts:AssumeRole` — each agent pod federates directly into a role in the tenant account using IRSA / web-identity, with the tenant-account role trusting the control cluster's OIDC provider:

1. **Each tenant account**: register the control cluster's IRSA OIDC provider as an identity provider (the EKS issuer is public, so any account can trust it), then create a `platz-k8s-agent` role whose trust policy allows `AssumeRoleWithWebIdentity` for the control cluster's `system:serviceaccount:<ns>:<release>-k8s-agent-<instance>`. Give it `ec2:DescribeRegions`, `eks:ListClusters`, `eks:DescribeCluster`.
2. **Each tenant account's EKS cluster**: that role is mapped via EKS access entries (or the `aws-auth` ConfigMap on older clusters) to a Kubernetes ClusterRole that allows the operations Platz needs (cluster admin, in practice).
3. **In Platz Helm values**: one `k8sAgent.instances[]` entry per tenant account, each annotated with the tenant-account role ARN. The agent pod's ServiceAccount token is what gets federated into that role, so the instance name must match the one the role's trust policy pins.

```yaml
k8sAgent:
  instances:
    - name: tenant-foo
      provider: eks
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: arn:aws:iam::111122223333:role/platz-k8s-agent
    - name: tenant-bar
      provider: eks
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: arn:aws:iam::444455556666:role/platz-k8s-agent
```

Each instance is a separate StatefulSet with its own pod, ServiceAccount, and IAM role. The `terraform-aws-platzio` module (see [Installing with Terraform](/docs/guide/install/terraform)) automates the role creation and trust policy wiring.

## When clusters disappear

If the agent runs and a cluster that used to be there isn't found anymore (e.g., the EKS cluster was deleted), Platz **doesn't delete the row**. The cluster stays in the database, but its health check fails and it becomes unselectable. To fully remove it:

1. Make sure no deployments reference it.
2. Set the **Ignore** flag so it stops appearing in UI lists.

You can also delete the row directly in the database, but only if no deployment task references it (foreign keys). The conservative approach is to ignore and forget.

## Caveats

- **Cluster credentials are tied to the agent pod.** A cluster is reachable only from the specific `k8sAgent` instance that discovered it. If you move clusters between accounts but don't update the agent instances, deployments fail until you reconcile.
- **The agent uses a kube client per cluster.** Memory grows roughly linearly with the number of clusters. The default 1 GiB limit handles hundreds of clusters per instance, but if you're managing thousands, bump it.
- **Ingress settings affect every deployment in the cluster.** Changing `ingress_domain` on a cluster that hosts active deployments will, on next upgrade, regenerate every deployment's ingress with the new hostname. Plan DNS and certificate updates accordingly.
- **The agent doesn't manage cluster certs or DNS.** It assumes your TLS certs and DNS entries are already in place (created by cert-manager / external-dns / by-hand). Platz only points at them.
