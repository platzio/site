---
sidebar_position: 1
---

# Overview

A **deployment** in Platz is a single Helm release that Platz manages on your behalf. Each deployment maps one-to-one with a Kubernetes namespace, a Helm release inside that namespace, and a row in the `deployments` table.

This page is the user-facing tour: what a deployment consists of, what the deployment list and detail pages show, and how to create, edit, enable, disable, and delete deployments.

## Anatomy of a deployment

Every deployment has:

| Property | What it is |
| --- | --- |
| **Name** | A DNS-safe identifier (lowercase letters, digits, hyphens). It becomes the deployment's Kubernetes namespace name (after the chart's own naming logic) and influences its hostname. For `cardinality: OnePerCluster` charts, the name is implicit and equals the kind name. |
| **Kind** | The category, set by the registry the chart came from. You usually have one kind per service: `payments-api`, `shop-frontend`, `redis`, etc. |
| **Cluster** | The Kubernetes cluster the release lives in. Set at creation; can be changed later via the Recreate task. |
| **Chart version** | The specific `image_tag` of the Helm chart currently installed. Drives the chart's templates and the available config inputs. |
| **Config** | A JSON blob of the user-form values. Shown in the UI as a typed form generated from the chart's `values-ui.yaml`. |
| **Values Override** | An optional raw-YAML block that gets layered on top of the generated config. Owner-only; the escape hatch for things the form can't express. |
| **Description** | Free-form Markdown. A place to put runbook links, on-call info, dependencies — whatever the team wants. |
| **Enabled flag** | When `false`, the deployment is uninstalled from Kubernetes but its config and history remain in Platz. Re-enabling reinstalls it. |
| **Reported status** | Optional structured status reported by the chart's pods via the [Status feature](/docs/guide/deployments/status). Drives the badges, notices, and metrics on the overview tab. |

## The deployment list

When you open an env, the left-nav lands you on a list of all deployment kinds. Clicking a kind shows every deployment of that kind in that env. The list is grouped and sorted:

- Enabled deployments at the top, alphabetically.
- Disabled deployments below the divider.
- A **Show All** toggle that hides disabled deployments when off.

Each row shows:

- The deployment's icon (from the chart's `features.yaml` `display.icon`, defaults to the kind's icon).
- The deployment name.
- A status badge (running, pending, failed, disabled, unknown).
- Warning badges if the chart reported warnings via the Status feature.
- A collapsible error log if the last task failed.
- The cluster the deployment lives on, plus its region.
- A row of K8s resource status indicators (one per Pod / Deployment / StatefulSet / Job in the deployment's namespace).
- The current chart version. A "UPDATE AVAILABLE" badge appears when a newer version is available on the same branch.
- A "primary metric" cell on the right (configurable per chart via Features).

Clicking a row opens the deployment's detail page.

The **New Deployment** button appears top-right if you're an Owner of this kind (or env Admin / site Admin).

## The deployment detail page

`/envs/<env>/deployments/<kind>/<id>` has three tabs.

### Overview tab

Left column:

- **Description** — rendered Markdown. Edited via Actions → Edit Description (maintainer+).
- **Helm chart info** — the chart name, version, and the timestamp when it was pushed to the registry.
- **Cluster** — the cluster name and region.
- **Config values** — the current form values, read-only. (Edit via Actions → Edit Deployment.)

Right column (only renders if there's something to show):

- **Notices** — info, warning, and danger banners reported by the chart via the Status feature. Use sparingly; a deployment screaming "ALL FINE" on every page is noise.
- **Metrics** — numeric or text metrics reported by the chart. Rendered in a 2-column grid.

### Resources tab

Lists Kubernetes resources (Pods, Deployments, StatefulSets, **not** Jobs) in the deployment's namespace. Each row shows the resource kind, name, and a status indicator. Maintainers see a **Restart** button per resource that triggers a `RestartK8sResource` task.

### History tab

A paginated log of every task that's ever been run against this deployment. Newest first. See [Tasks & History](/docs/guide/deployments/tasks-and-history).

## Actions menu

Top-right of every deployment page, listed roughly in this order:

| Action | Visible when |
| --- | --- |
| Custom actions (from chart's `actions-schema.yaml`) | Chart has actions defined, user is maintainer+, deployment's current status matches the action's `allowed_on_statuses` |
| **Open Logs** (Grafana) | Cluster has Grafana URL and Loki datasource configured |
| **Edit Deployment** | Maintainer+ |
| **Clone From Deployment** | Maintainer+ |
| **Edit Description** | Maintainer+ |
| **Enable** / **Disable** | Owner+ |
| **Delete** | Owner+ |

If your role doesn't give you access to the actions you'd expect to see, check [Permissions](/docs/guide/envs/permissions).

## Creating a deployment

Click **New Deployment** (or, on an empty list, **Create First Deployment**). The modal asks for:

1. **Name** — if the chart has `cardinality: Many`, you need to provide one. Pattern: `^[-a-z0-9]+$`, max 62 minus kind-name length. For `cardinality: OnePerCluster` charts (singletons), the name is hidden and reused from the kind.
2. **Cluster** — a dropdown of clusters attached to this env, filtered to non-ignored, healthy clusters with valid ingress settings if the chart needs them.
3. **Chart version** — a dropdown of available chart tags for this kind. Newer first. Charts marked `available: false` (registry deletions) or broken charts show with badges and are unselectable.
4. **Config form** — the form generated from `values-ui.yaml`. Dynamic rendering, conditional inputs (`showIf`), `CollectionSelect` lookups from env secrets and other deployments.
5. **Values Override** — owner-only. Hidden behind an "Advanced" toggle.

Submit. Platz writes an `Install` task. The k8s-agent picks it up, creates the namespace, spawns a helm pod, runs `helm install`. The deployment appears in the list with a "Installing" status; once the helm pod finishes, it transitions to whatever status the chart's pods report (or "Running" if there's no Status feature).

## Editing a deployment

**Actions → Edit Deployment**. The modal looks like the creation modal but with current values pre-filled. You can change:

- Chart version (drops you on Upgrade task).
- Config inputs.
- Values override (if you're an owner).
- Cluster (drops you on Recreate task).

Changing the deployment name isn't supported — names are immutable. Clone and uninstall the original if you need a rename.

## Cloning

**Actions → Clone From Deployment**. Opens the create modal pre-filled with the source deployment's chart version, config, and values override. The name field is cleared. Save and you've got a new deployment with the same config but a different name.

Useful for spinning up additional instances quickly, or making per-customer copies of a tenant deployment.

## Enabling / disabling

**Actions → Disable** uninstalls the deployment from Kubernetes (`helm uninstall`), drops the namespace, but keeps the deployment row, history, and config in Platz.

**Actions → Enable** reinstalls. The chart and config are whatever they were when the deployment was disabled.

Two reasons to disable rather than delete:

- You're not 100% sure you'll never need it again. Disable preserves the audit trail and config.
- You want to free up cluster resources but plan to re-enable later (a dev environment that doesn't need to run overnight).

Disabled deployments don't accrue helm operations or trigger any tasks, but they do still consume one row each in `deployments` — negligible at any practical scale.

## Deleting

**Actions → Delete** uninstalls *and* removes the deployment row. Cascade deletes its tasks, resources, and resource references.

Deletion is permanent. The audit trail (who deployed what when) goes with it. If you want the audit history preserved, disable instead of delete.

## Caveats

- **Deployment names are case-sensitive but lowercase-only.** A typo here is a typo forever.
- **The cluster dropdown is computed at form-open time.** If a cluster becomes unhealthy after you start filling in the form, you can still submit and the install will fail at task-execution time, not at form-submit time. Refresh the page to see the current cluster status.
- **The chart version dropdown shows everything**, including the same image_tag in two registries pointing at the same kind. Pick the one that matches your intent; the audit log records the exact helm_chart_id.
- **Values override has no schema.** It's raw YAML, merged after the form-generated values. Owners can use it to set arbitrary helm values — but it's also a footgun. If a chart upgrade changes a value's path, an unmaintained override silently does nothing.
- **There's no preview** of the final helm values before installing. If you need to see what Platz will send to helm, look at the helm pod's logs after the install starts.
