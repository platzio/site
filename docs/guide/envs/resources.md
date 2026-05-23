---
sidebar_position: 4
---

# Resources

A **deployment resource** in Platz is a structured child object owned by a deployment — for example, a Shop owned by a Storefront service, a Database owned by a DatabaseService chart, a Webhook owned by an integration deployment.

Resources let chart authors declare "my service has a collection of these things" — and Platz handles the UI, the storage, and the lifecycle hooks (create / update / delete callbacks back to the chart's pods).

This is a chart-extension feature; if none of your charts declare a `resources.yaml`, the env's left-nav won't show any resource type entries and you can skip this page. If your charts *do* declare resource types, this is the env-level UI for managing the resource instances.

## Resource types vs resources

Two related concepts:

- A **resource type** is declared by a chart in [`platz/resources.yaml`](/docs/guide/chart-ext/resources). It defines what a thing of this type *is* — its singular and plural names, its UI form (a `values-ui.yaml`-style input schema), an icon, and optional create/update/delete lifecycle hooks that call back to the deployment's API.
- A **resource** is an instance of a resource type. It has values for the inputs defined in the type, and it's owned by a specific deployment.

When a chart with a `resources.yaml` is installed, the resource type appears in the env's top navigation bar (as a tab next to "Deployments"). Clicking the tab opens the resource list for that type.

## The resource list

`/envs/<env>/resources/<resource-type>` shows every resource of the given type in the current env. The page is structured like the deployments list:

- Header with the plural name (e.g., "Shops") and an **Add First Shop** button (or similar).
- A row per resource showing its name, status, and the owning deployment.
- Per-row actions: edit, delete (subject to the type's lifecycle config and the user's role).

## Creating a resource

Click the **Add** button. A modal opens with:

1. **Owning deployment** — a dropdown of deployments capable of owning resources of this type. Only deployments whose chart declares this resource type appear here.
2. **Resource name** — a DNS-safe identifier.
3. **Inputs** — a form generated from the resource type's `values_ui.inputs`, same dynamic rendering as deployment forms.

On submit, Platz:

1. Stores the resource in the `deployment_resources` table, linked to the owning deployment.
2. If the resource type has a `lifecycle.create` action defined, Platz fires an HTTP request to the owning deployment's standard ingress endpoint with the resource's values as the body. The deployment's own back-end is expected to handle creation in whatever external system the resource maps to.

## Updating a resource

Click a resource row. A modal opens pre-filled with current values. Edit and submit. Platz updates the row and fires the `lifecycle.update` hook if defined.

## Deleting a resource

Click the trash icon (or equivalent). Platz removes the row and fires the `lifecycle.delete` hook.

The lifecycle hooks are best-effort: if the deployment's back-end is down or returns an error, Platz still updates the database. The chart author is responsible for handling reconciliation (e.g., having the deployment periodically reconcile its known-resources list against what Platz knows about).

## Resources vs deployments

Why have a separate concept and not just nest things as child deployments?

| Resources | Child deployments |
| --- | --- |
| Lightweight rows in Platz's database | Full Helm releases |
| Managed by their owning deployment's back-end | Managed by Helm |
| Created in seconds | Created in tens of seconds |
| No Kubernetes resources of their own | Have their own namespace, pods, services |
| Custom UI form per resource type | Same UI form for all instances of a chart |

Use resources when the "thing" is logical state owned by an existing deployment — a Shop in a multi-tenant Storefront, a tenant in a SaaS app, a queue in a queue-management service. Use child deployments when each thing genuinely needs its own pods.

## Filtered resource selection

Like secrets, resources can be referenced from another chart's inputs via [`CollectionSelect`](/docs/guide/chart-ext/inputs#collectionselect). A common pattern: chart A declares a `Shop` resource type, chart B has an input that picks a Shop:

```yaml
- id: shop_id
  type: CollectionSelect
  label: Shop
  collection:
    DeploymentResources:
      filters:
        type: shop
```

The dropdown will show every `Shop` resource in the env, sorted by owning deployment. When a user picks one, chart B's deployment config stores the resource ID; at helm install time, Platz resolves the ID to the resource's actual values and injects them into chart B's helm values.

This is how Platz services compose: one chart's resources become another chart's inputs, declaratively.

## Caveats

- **Resource types are scoped to charts.** The same chart installed twice (two deployments) produces two independent resource lists. Resources don't pool across deployments of the same chart.
- **No bulk import.** If you're migrating from another system that has 500 shops, you'll need to script the API calls — there's no CSV upload.
- **Lifecycle hooks have no retry policy.** If the deployment's back-end is unreachable when you create a resource, the create hook fails and Platz logs it but doesn't retry. You'd see this in the resource's status and need to manually trigger a reconciliation.
- **No resource-level RBAC.** Anyone with env access to a resource type can manage all of its instances. Per-resource access control would need to happen in the owning deployment's back-end, not in Platz.
- **Resources don't have their own audit log.** The deployment_tasks table records deployment-level operations; resource CRUD is not currently exposed in History. The database has the timestamps if you need to dig.
