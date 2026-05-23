---
sidebar_position: 4
---

# Tasks & History

Everything Platz does to a deployment is recorded as a **task** — a row in the `deployment_tasks` table that describes _what_ should happen, _who_ triggered it, and _what_ the outcome was. The History tab on each deployment is a paginated view of that table, newest first.

This page explains the task types, their lifecycle, and how to read the History tab.

## Task types

| Operation              | Triggered by                                                                                                                 | What it does                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Install**            | First save of a new deployment                                                                                               | Creates the namespace, runs `helm install`                                          |
| **Upgrade**            | Editing chart version, config inputs, or values_override on an existing deployment                                           | Runs `helm upgrade` with the new values                                             |
| **Reinstall**          | A referenced env secret changed, or a referenced deployment was re-deployed (if `reinstall_dependencies: true` on the chart) | Same as Upgrade but with a "reason" recorded                                        |
| **Recreate**           | Moving a deployment to a different cluster (and optionally a different namespace)                                            | Uninstalls from old location, installs into the new one                             |
| **Uninstall**          | Disabling or deleting a deployment                                                                                           | Runs `helm uninstall`, deletes the namespace                                        |
| **InvokeAction**       | A user clicks a chart-defined action, or another deployment calls the action via the API                                     | HTTPS POST to the chart's standard ingress endpoint with the action body            |
| **RestartK8sResource** | The Restart button on a row in the Resources tab                                                                             | `kubectl rollout restart` on a Deployment/StatefulSet, or `kubectl delete` on a Pod |

Every task carries:

- `id` and `created_at` — the unique task ID and when it was queued.
- `execute_at` — usually the same as `created_at`, but can be in the future for scheduled retries.
- `operation` — a JSON blob describing the task type and its parameters.
- `status` — one of `Pending` → `Started` → `Done` / `Failed` / `Canceled`.
- `acting_user_id`, `acting_bot_id`, or `acting_deployment_id` — who triggered the task. Exactly one is set.
- `reason` — a free-form string. Populated for Reinstall tasks (why the reinstall) and for failed tasks (the captured error message).

## Task lifecycle

A task moves through these states:

1. **Pending** — written to the database, waiting for a worker to pick it up.
2. **Started** — a worker has begun execution. `started_at` is set.
3. **Done** — the worker reported success. `finished_at` is set.
4. **Failed** — the worker reported failure. `finished_at` is set, `reason` carries the error.
5. **Canceled** — a user (or admin) cancelled it before it started, or while it was still in flight. `canceled_by_user_id` is set.

Once a task reaches a terminal state (`Done`, `Failed`, `Canceled`), it stays there. Platz doesn't auto-retry. If you want to retry a failed task, edit the deployment again (or click the equivalent action) to enqueue a fresh task.

## Concurrency

Within a single deployment, tasks execute strictly one at a time. The k8s-agent picks up the oldest `Pending` task for a deployment and won't start another for the same deployment until it finishes. This prevents conflicting helm operations from racing.

Across deployments, tasks run in parallel — the k8s-agent per cluster has a worker pool. The default sizing handles a few dozen concurrent tasks comfortably.

## The History tab

`/envs/<env>/deployments/<kind>/<id>/history` (or the History tab on the detail page) shows a paginated list of every task ever run against the deployment. 10 per page. Each row shows:

- A **status badge** (Pending / Started / Done / Failed / Canceled, with an icon).
- The **operation type** (Install / Upgrade / Reinstall / Recreate / Uninstall / InvokeAction / RestartK8sResource), with type-specific details:
  - **Upgrade**: shows the previous chart version, the new chart version, and a config diff.
  - **Reinstall**: shows the `reason` (e.g. "secret X changed").
  - **Recreate**: shows the previous and new cluster names.
  - **InvokeAction**: shows the action ID and a JSON preview of the body.
  - **RestartK8sResource**: shows the resource kind and name.
- The **acting user / bot / deployment** ("triggered by Alice" / "triggered by ci-deploy-bot" / "triggered by upstream-deployment").
- The **timestamp** of creation.
- An **expandable log** if the task failed — shows the captured error.

The list is read-only. You can't edit a task or alter its history. (For pruning old tasks, see the database growth notes in [Database](/docs/guide/install/database).)

## Reading failed task logs

When a task fails, the expandable log usually contains the helm pod's stderr — verbatim from `helm install` / `helm upgrade`. Common failures:

- **`UPGRADE FAILED: cannot patch ... existing resource conflict`** — something outside Platz modified a resource the chart owns. Helm refuses to overwrite. Either revert the manual change, or use `--force` (not exposed by Platz; you'd need to fix it at the cluster level).
- **`Error: timed out waiting for the condition`** — a Pod isn't becoming Ready. Check the Resources tab for pod status, or open Grafana for the deployment's logs.
- **`Error: failed to download "oci://..."`** — the helm pod can't reach the chart registry. For ECR, the IRSA role is probably misconfigured. For OCI, network policy may be blocking the egress.
- **`Error: render error`** — the chart's templates are broken. The error message includes the template file and line. Fix the chart and push a new version.

For tasks of type `InvokeAction`, the error is the action endpoint's HTTP response body — anything the chart's pod chose to return.

## Canceling tasks

In the UI, the only tasks you can cancel are `Pending` ones (clicked the wrong button, want to undo before the worker picks it up). Click the cancel icon on the row in History. The task transitions to `Canceled` immediately.

Tasks that are already `Started` can technically be canceled (a row in `deployment_tasks` has a `canceled_by_user_id` column), but the worker checks the cancel flag only between phases — once the helm pod is running, cancellation waits until helm finishes. There's no `helm uninstall` mid-rollout.

## Auditing

The History tab is also the audit log. Useful queries:

- "Who deployed the broken version of payments-api?" → filter by deployment, find the Upgrade task that introduced the bad image_tag, look at `acting_user_id`.
- "Which deployments has the CI bot touched today?" → not surfaced in the UI; query `deployment_tasks` directly: `WHERE acting_bot_id = '...' AND created_at > now() - interval '1 day'`.
- "When was the last successful deploy?" → scroll the History tab until you find a `Done` status.

For compliance scenarios that need formal audit logs, export `deployment_tasks` rows to your SIEM. Platz doesn't push tasks to external systems out of the box; do it via a periodic export job or a Postgres logical replication slot.

## Caveats

- **No task-level retry button.** If a task failed for a transient reason (network blip while talking to the registry), the way to retry is to re-trigger the operation through the UI (e.g., edit the deployment and save without changes to enqueue an Upgrade). There's no "retry this exact task" link.
- **The History tab is per-deployment.** There's no cross-deployment task view in the UI. For "what's happening across the env right now", you need to either query the database or watch the WebSocket events stream.
- **Task `reason` is plain text.** It may include the helm pod's stdout/stderr (large), which can make the History tab slow to render for very chatty failures. Truncation is not currently applied.
- **Old tasks accumulate.** A deployment that's been around for a year on an active service might have hundreds of tasks. The list is paginated but the underlying table grows monotonically. See [Database](/docs/guide/install/database) for retention guidance.
- **Cancelling a task doesn't roll back partial work.** A canceled Upgrade that already updated some resources will leave them in their new state; the chart's next deploy reconciles them. Cancellation is _don't start_ and _attempt to stop_, not _undo_.
