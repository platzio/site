---
sidebar_position: 1
---

# Welcome to Platz 👋

Platz is a self-hosted control plane for Helm deployments. It turns your Helm charts into a guided, role-controlled experience — giving every team a typed form, a live status view, and an audit trail, without needing direct `kubectl` or `helm` access.

You install Platz once into a Kubernetes cluster, point it at one or more registries that hold your Helm charts, and let it manage deployments across as many Kubernetes clusters as you want.

## What Platz gives you

- **A web UI for every Helm chart.** Charts that ship a [Chart Extension](/docs/guide/chart-ext/overview) get a typed form generated from a YAML schema — text fields, numbers, checkboxes, drop-downs, conditional inputs, references to environment secrets, and more. Charts without extensions still work; users just fill in raw Helm values.
- **An environment model that mirrors how teams actually work.** [Envs](/docs/guide/envs/clusters) group clusters and the people who can deploy to them. Production lives in one env, staging in another, your dogfood cluster in a third — each with its own user list and role assignments.
- **Granular RBAC.** Env-level roles (Admin, User) gate access to whole environments; deployment-level roles (Owner, Maintainer) gate specific deployment kinds. Site admins manage the whole installation. See [Permissions](/docs/guide/envs/permissions).
- **Automatic chart discovery.** Platz watches a Helm registry (Amazon ECR or any generic OCI registry) and surfaces new chart versions as soon as they're pushed. See [Helm Registries](/docs/guide/admin/helm-registries).
- **A live history of every action.** Every install, upgrade, action invocation, restart, and rollback is recorded as a [Task](/docs/guide/deployments/tasks-and-history), with who did it, when, and whether it succeeded.
- **Live cluster awareness.** Platz tracks the Kubernetes resources of each deployment — Pods, Deployments, StatefulSets, Jobs — and reflects their health in the UI, with restart buttons for the impatient. See [Tracking](/docs/guide/deployments/tracking).
- **Bot accounts for automation.** Issue scoped API tokens to CI pipelines, GitOps controllers, and chart back-ends so they can deploy and invoke actions without using a human's credentials. See [Bots](/docs/guide/admin/bots).
- **WebSocket-driven UI.** The frontend opens a WebSocket on load and listens to PostgreSQL change events; deployments, tasks, and resources update without a page refresh.

## Core concepts at a glance

| Concept             | What it is                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Env**             | A logical grouping of clusters and the deployments that run on them. Roles are assigned per env.                                               |
| **Cluster**         | A Kubernetes cluster registered with Platz. A cluster is attached to at most one env.                                                          |
| **Deployment Kind** | A category of deployments — usually one per service. Multiple Helm registries can map to the same kind.                                        |
| **Deployment**      | A single Helm release Platz manages. Lives in its own namespace inside a cluster.                                                              |
| **Helm Registry**   | An OCI registry (ECR or generic) that Platz scans for charts.                                                                                  |
| **Chart Extension** | Optional YAML files that ship inside a Helm chart and give Platz richer inputs, outputs, status, and actions.                                  |
| **Task**            | A unit of work against a deployment — install, upgrade, uninstall, action invocation, resource restart. Has a status and a full execution log. |
| **Secret**          | A named value stored at the env level. Surfaced to charts through the `CollectionSelect` input type.                                           |

## How a deployment happens

A typical day at the office goes like this:

1. A developer pushes a new image tag to a Helm OCI registry (ECR, GHCR, or a self-hosted Docker Distribution).
2. The `platz-chart-discovery` worker notices the new chart within seconds — either via an SQS event (ECR) or a registry poll (generic OCI). It parses the chart's metadata and Chart Extension files, then writes a new row to the `helm_charts` table.
3. A user with the right role opens the Platz UI and clicks **New Deployment** (or **Edit** on an existing one). They see a form generated from the chart's `values-ui.yaml`. They fill it in, pick a cluster, hit Submit.
4. Platz writes a `deployment_task` row with operation `Install` (or `Upgrade`, `Reinstall`, etc.).
5. The `platz-k8s-agent` running with credentials for that cluster picks up the task, spawns a short-lived helm pod inside the cluster, and runs `helm install` or `helm upgrade` with the merged values.
6. The deployment's Kubernetes namespace is created with the label `platz=yes`. The `platz-resource-sync` worker starts watching it and reflects every Pod, Deployment, StatefulSet, and Job back into Platz.
7. If the chart enabled the [Status feature](/docs/guide/deployments/status), the `platz-status-updates` worker polls the deployment's status endpoint and surfaces the result in the UI.

Every step is logged. Failures show the captured stderr from the helm pod, so you can debug from the browser without having to chase logs in three different places.

## Where to go next

- **Setting up Platz for the first time?** Start at [Installing with Helm](/docs/guide/install/helm). You'll need a Kubernetes cluster, a Postgres database, and an OIDC provider.
- **Got Platz running and want to onboard a team?** Read [Envs](/docs/guide/envs/clusters), [Permissions](/docs/guide/envs/permissions), and [Users](/docs/guide/admin/users).
- **You're a chart author who wants to enrich the UI for your service?** Jump to [Chart Extensions](/docs/guide/chart-ext/overview) — that's where the depth is.
- **You're an end user who just got access to a Platz instance?** [Deployments → Overview](/docs/guide/deployments/overview) explains the deployment list, detail page, and the day-to-day deploy workflow.
- **Hooking up CI or a chart back-end?** [Bots](/docs/guide/admin/bots) and the [API reference](/docs/api/) walk through token issuance and machine authentication.

If you spot something that's outdated, vague, or just plain wrong — the docs source lives at [github.com/platzio/site](https://github.com/platzio/site). Pull requests are welcome.
