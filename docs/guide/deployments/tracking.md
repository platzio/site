---
sidebar_position: 2
---

# How Deployments are Tracked

Platz keeps an opinionated, live picture of what your deployments are doing in their target clusters. This page explains how the tracking works — what gets recorded, how, and where the limits are — so you know what to trust and what not to.

## The namespace label

Every deployment Platz creates lives in a dedicated Kubernetes namespace, labelled at creation time:

```yaml
metadata:
  labels:
    platz: "yes"
  annotations:
    platz_deployment_id: <uuid>
```

The label `platz=yes` is what the trackers use to filter Kubernetes resources down to "things Platz owns". The annotation links the namespace back to the specific deployment row in the database, so the trackers can join up which Pod/Deployment/StatefulSet/Job belongs to which Platz deployment.

If a namespace doesn't have the label, Platz ignores it — even if it was somehow created by Platz historically. Don't strip the label off; you'll lose tracking until it's reapplied.

## The k8s-agent tracker

The `platz-k8s-agent` worker runs a tracker per cluster. For each cluster, it opens watches for:

- **Namespaces** with the `platz=yes` label. Triggered changes flip the deployment's status (e.g. namespace deleted → deployment status moves to `Done` after uninstall, or `Unknown` if the deletion was unexpected).
- **Deployments**, **StatefulSets**, and **Jobs** inside `platz=yes` namespaces. Each resource is reflected into the `k8s_resources` table.

The tracker uses Kubernetes' native watch mechanism (long-lived HTTP connections with `?watch=true`), so updates are real-time, not polled. Latency from "kubelet updates a pod's status" to "Platz's UI shows the new status" is typically sub-second.

## The resource-sync worker

`platz-resource-sync` is a thin worker that mostly:

- Reflects Pods (which the k8s-agent tracker doesn't write directly — that'd be too much database write traffic).
- Detects stale `k8s_resources` rows whose `last_updated_at` is older than the staleness window and removes them.

This is what keeps the Resources tab in the UI accurate after a Kubernetes object disappears from the cluster.

## What's tracked vs not tracked

| Kubernetes resource | Tracked? | Where it shows up |
| --- | --- | --- |
| Namespace | Yes (existence and label) | Deployment status, used as the deployment-namespace anchor |
| Deployment (`apps/v1`) | Yes (full status) | Resources tab |
| StatefulSet | Yes (full status) | Resources tab |
| Job | Yes (status, but completed jobs are filtered out of the Resources tab) | Internal — used to track one-shot operations |
| Pod | Yes (status, names) | Resources tab — surfaced as children of the parent Deployment/StatefulSet |
| Service | No | Use `kubectl` |
| ConfigMap | No | Use `kubectl` |
| Secret | No (Platz creates them but doesn't track their state) | The deployment's namespace |
| Ingress | No | The deployment's namespace |
| Anything custom (CRDs) | No (Platz doesn't know about them) | The deployment's namespace |

If you need to see anything Platz doesn't track, the Open Logs Grafana link (see [Logs](/docs/guide/admin/logs)) usually gives you enough context. For arbitrary `kubectl` access, you'll need direct cluster credentials.

## Status fields

Every Platz `deployment` has a `status` enum that's set by the deployment's state in the cluster (plus, optionally, the [reported status](/docs/guide/deployments/status) from the chart's pods):

| Status | When |
| --- | --- |
| `Installing` | An Install task is in flight |
| `Upgrading` | An Upgrade task is in flight |
| `Running` | Helm install finished successfully and the chart's primary workload is healthy |
| `Pending` | Created but no task has finished yet |
| `Error` | The last task failed; the deployment is in an indeterminate state |
| `Uninstalling` | An Uninstall task is in flight |
| `Disabled` | Deployment is disabled (`enabled: false`) |
| `Unknown` | Tracker hasn't seen the deployment recently or its namespace went missing unexpectedly |

The badge color in the UI maps from this enum. The chart's own reported status (from the Status feature) is layered on top and surfaces as warnings/notices in the Overview tab.

## How "primary metric" and "warnings" surface

If a chart enables the [Status feature](/docs/guide/deployments/status), it provides an HTTP endpoint that returns a JSON document with:

- A `status_color` (red/yellow/green) and a free-form text status.
- Optional notices (info/warning/danger) shown on the Overview tab.
- Optional metrics shown in the metrics grid.
- Optional `primary_metric` shown directly in the deployment list row.

The Status feature is opt-in; charts without it still get tracked via the namespace label flow above but lack the rich status display.

## Reflecting state into the database

The `k8s_resources` table is the single source of truth for "what's in the cluster". Each row has:

- `id` (UUID).
- `cluster_id`, `deployment_id` (foreign keys).
- `kind`, `api_version`, `name`.
- `status_color` (array of strings — one per pod, mostly).
- `metadata` (JSON blob mirroring the relevant fields of the K8s object).
- `last_updated_at`.

The Resources tab in the UI is a paginated, filtered view of this table. Other parts of the UI (the deployment list status indicators) read from the same table — so what you see is always what's currently reflected, not what was once true.

## The "Restart Resource" action

From the Resources tab, maintainers can click **Restart** on any Pod, Deployment, or StatefulSet row. Platz creates a `RestartK8sResource` task; the k8s-agent picks it up and:

- For Deployments and StatefulSets: triggers a rollout restart (the equivalent of `kubectl rollout restart`).
- For Pods: deletes the pod, letting the parent recreate it.

The task is fully audited — appears in the deployment's history with `acting_user_id` set, so "who restarted prod" has an answer.

## Stale resource cleanup

If a resource exists in `k8s_resources` but the tracker hasn't seen it in the cluster for the staleness window (a few minutes), `platz-resource-sync` deletes the row. This handles cases where:

- The k8s-agent missed a delete event (network blip during a watch).
- A resource was manually deleted via `kubectl`.
- The cluster restarted and the watch reconnected.

The cleanup means the Resources tab is eventually consistent: you might briefly see a phantom pod for a minute after `kubectl delete pod`, but it disappears soon.

## Caveats

- **No history.** Platz only knows about resources that *currently* exist (or recently existed). There's no "show me what pods this deployment had last week". Use your log/metric stack for that.
- **No CRD tracking.** Charts that create custom resources (e.g., Prometheus `ServiceMonitor`, ArgoCD `Application`) don't get those CRs reflected into Platz. If your chart depends on a CR being in the right state, write a status feature that polls it from inside the chart's own pod.
- **Multi-namespace charts are not supported.** Platz assumes one chart = one namespace. Charts that try to create resources outside their own namespace work, but those resources won't show up in the Resources tab. Don't do this if you can avoid it.
- **The label is load-bearing.** Removing `platz=yes` from a namespace effectively orphans the deployment from Platz's perspective. The Helm release still exists, but Platz stops tracking it. Re-adding the label re-enables tracking.
- **The k8s-agent uses one watch connection per cluster.** A flaky network between the agent and a cluster's API server causes watch reconnections, which are mostly transparent but can briefly show stale state. The agent's logs show reconnection events.
