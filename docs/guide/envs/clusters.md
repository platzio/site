---
sidebar_position: 1
---

# Clusters

Every env in Platz has a set of clusters attached to it. The cluster set is what an env user can deploy *into* — when you click "New Deployment" the cluster dropdown is filtered to the clusters attached to the current env.

This page is the env-level perspective on clusters: what's already attached, what users can do with them, and the dotted line back to the site-level cluster admin page.

## How clusters get attached

Cluster discovery happens at the site level (see [Admin → Clusters](/docs/guide/admin/clusters)). Once a cluster shows up in Platz, a site admin attaches it to an env. After attachment, env-level users see the cluster in their env settings and in the cluster picker on deployment forms.

Env-level admins **cannot** attach or detach clusters themselves. That's a site-admin operation. If you need a cluster attached to your env and don't have site admin rights, ask whoever installed Platz to do it.

## The env's cluster list

`/envs/<env>/settings/clusters` shows the clusters attached to the current env. For each cluster:

- **Name** — derived from the EKS cluster name or the kubeconfig context.
- **Region** — for EKS clusters, the AWS region. For local clusters, `local`.
- **Status** — green if `is_ok: true` and `ignore: false`, otherwise an error badge with the `not_ok_reason`.
- **Ingress** — a quick view of the ingress domain, class, and TLS secret name. Editable only by site admins.
- **Number of deployments** — a count of deployments currently on this cluster from this env.

Env users (non-admin) see this page but in read-only mode. Env admins see the same view; the only editable parts (ingress, Grafana) are still site-admin-only because those affect every deployment on the cluster, not just this env's deployments.

## What env users can change

Effectively nothing on this page. The env-level cluster view is informational — letting users see "yes, the cluster is attached, yes, it's healthy" without giving them site-admin powers.

If a cluster is unhealthy and your deployment is broken because of it, the right escalation path is:

1. Note the `not_ok_reason` shown in the UI.
2. Open `/admin/clusters/<id>` if you're a site admin; otherwise ping your operator with the cluster name and reason.

## Cluster status and what it means

A cluster's `is_ok` flag is set by the agent's periodic health check (a kube API ping). Common failure modes:

- **Connection refused / timed out** — the cluster's API endpoint is unreachable from the Platz agent's network. Could be a VPC peering issue, an EKS endpoint that's now private-only, or the cluster being torn down.
- **Unauthorized** — the agent's credentials no longer have access. For EKS, this usually means the role's `aws-auth` mapping was changed.
- **Stale `last_seen_at`** — the agent isn't running, or hasn't reached this cluster in the last few intervals. Check the `platz-platzio-k8s-agent-<name>` pod's logs.

A failing cluster doesn't take down running deployments — the kubelets in the cluster keep doing their thing. It does prevent Platz from running new deployment tasks (helm install, upgrade, restart). Existing tasks already in flight may finish or stall depending on when the failure started.

## Choosing a cluster on a new deployment

The cluster picker in the deployment creation form:

- Shows clusters attached to the current env.
- Filters out clusters with `ignore: true`.
- Filters out clusters with `is_ok: false`.
- Filters out clusters whose `ingress_domain` is empty if the chart's `features.ingress.enabled: true` (because the standard ingress feature can't function without a domain).

If the dropdown is empty when you click "New Deployment", the most likely causes:

1. The env has no clusters attached (talk to a site admin).
2. The only attached clusters are ignored or unhealthy.
3. The chart requires standard ingress and no cluster has an ingress domain set.

## Moving a deployment between clusters

The **Recreate** task type moves a deployment between clusters or namespaces. See [Deployment Tasks & History](/docs/guide/deployments/tasks-and-history#recreate). The user-facing flow: open the deployment, **Edit Deployment**, change the cluster dropdown, save. Platz uninstalls the deployment from the old cluster and reinstalls it on the new one in a single task.

Recreate is a maintainer-or-owner operation. A regular User role can't move deployments between clusters.

## Caveats

- **Detaching a cluster from an env doesn't uninstall deployments.** A site admin who detaches `prod-us-east-1` from the `production` env doesn't make the deployments disappear from Kubernetes — they keep running. They just become invisible in the Platz UI (because the env no longer owns them). This is rarely what you want; site admins should uninstall first, then detach.
- **A cluster belongs to one env at a time.** You can't share a cluster across two envs (e.g., letting both `production` and `staging` users deploy to a single cluster). The workaround is to have two clusters at the Kubernetes level — usually a good idea anyway for blast-radius reasons.
- **Cluster names aren't unique across the install.** Two clusters can share a name if their provider IDs differ (e.g., two EKS clusters in different regions both named `apps`). The UI shows the region next to the name to disambiguate.
- **The number of attached clusters affects deployment dropdown latency on slow connections.** Each cluster's status is fetched at form-render time. With dozens of clusters, the dropdown can take a noticeable second to populate.
