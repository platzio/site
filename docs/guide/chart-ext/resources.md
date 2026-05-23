---
sidebar_position: 6
---

# Resources

`platz/resources.yaml` defines **resource types** — structured child objects your chart's deployments can own. Examples: a Shop owned by a Storefront deployment, a Tenant owned by a SaaS app, a Webhook owned by an integration deployment, a Database owned by a database-provisioner deployment.

This page covers the chart-author side: declaring resource types in `resources.yaml`, the lifecycle hooks that fire when resources are created/updated/deleted, and how chart-managed resources surface in other charts via `CollectionSelect`.

For the end-user side (managing resource instances in the UI), see [Env Resources](/docs/guide/envs/resources).

## When to use resource types

Resource types fit when:

- Your service has logical sub-objects that aren't worth a full Helm release each.
- The sub-objects need user-managed UI (form for create, list view, etc.).
- The sub-objects can be referenced by other deployments via dropdowns.

If each sub-object needs its own Kubernetes resources (pods, services, separate namespaces), you're better off creating it as a separate deployment of a child chart, not as a resource. Resources are _data_ objects in Platz's database with optional callback hooks; they're not Helm releases.

## File structure

Resources file is a list of `ResourceType` resources:

```yaml
- apiVersion: platz.io/v1beta1
  kind: ResourceType
  key: shop
  spec:
    name_singular: Shop
    name_plural: Shops
    fontawesome_icon: shop
    values_ui:
      inputs:
        - id: name
          type: text
          label: Shop Name
          required: true
        - id: opening_hour
          type: number
          label: Opening Hour (UTC)
          minimum: 0
          maximum: 23
          initialValue: 8
        - id: closing_hour
          type: number
          label: Closing Hour (UTC)
          minimum: 0
          maximum: 23
          initialValue: 20
      outputs:
        values:
          - path: [name]
            value:
              FieldValue:
                input: name
          - path: [opening_hour]
            value:
              FieldValue:
                input: opening_hour
          - path: [closing_hour]
            value:
              FieldValue:
                input: closing_hour
    lifecycle:
      create:
        allowed_role: Maintainer
      update:
        allowed_role: Maintainer
      delete:
        allowed_role: Owner

- apiVersion: platz.io/v1beta1
  kind: ResourceType
  key: webhook
  spec:
    name_singular: Webhook
    name_plural: Webhooks
    # ...
```

Each `ResourceType` is a separate resource. You can declare multiple resource types in one chart's `resources.yaml`.

## Spec fields

| Field                         | Type    | Required           | Notes                                                                                                       |
| ----------------------------- | ------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `key` (top-level on resource) | string  | Yes                | Machine identifier for this type. Used in collection references and audit logs. Don't change after release. |
| `spec.name_singular`          | string  | Yes                | Display name for one instance (e.g., "Shop"). Used in headers and button labels.                            |
| `spec.name_plural`            | string  | Yes                | Display name for many (e.g., "Shops"). Used in the env-nav tab and list headers.                            |
| `spec.fontawesome_icon`       | string  | Yes                | FontAwesome class without `fa-` prefix. Shown next to the resource type label and in each row.              |
| `spec.global`                 | boolean | No (default false) | If `true`, resources of this type are visible across envs (rare; usually leave as false).                   |
| `spec.values_ui`              | object  | Yes                | A full values-ui schema (inputs + outputs). Defines the form for creating/editing instances.                |
| `spec.lifecycle`              | object  | No                 | Per-operation hook config. See below.                                                                       |

The `values_ui` block is exactly the same schema as a chart's main `values-ui.yaml` — see [Inputs](/docs/guide/chart-ext/inputs) and [Outputs](/docs/guide/chart-ext/outputs). The `outputs.values` are stored in the resource's `properties` field; the `outputs.secrets` block is **not** applicable to resources (resources don't create Kubernetes Secrets).

## Lifecycle hooks

When users create/update/delete a resource instance in the UI, Platz can call back to the owning deployment's standard ingress, just like an action invocation. The chart's pod implements the endpoints and does whatever provisioning is needed in the external system the resources represent.

```yaml
spec:
  lifecycle:
    create:
      allowed_role: Maintainer
      target:
        endpoint: standard_ingress
        path: /api/v1/resources/shop
        method: POST
    update:
      allowed_role: Maintainer
      target:
        endpoint: standard_ingress
        path: /api/v1/resources/shop
        method: PUT
    delete:
      allowed_role: Owner
      target:
        endpoint: standard_ingress
        path: /api/v1/resources/shop
        method: DELETE
```

The `target` is optional. If absent, Platz writes the resource row to the database (or removes it for delete) and that's it — no callback. If present, Platz fires the HTTP request _in addition to_ the database write.

The HTTP request includes the resource's resolved output values as the JSON body, plus an `Authorization: Bearer <jwt>` header (same JWT as actions, see [Credentials](/docs/guide/deployments/credentials)).

`allowed_role` controls who can perform that operation. `Owner` and `Maintainer` are the options; same semantics as action permissions.

If the lifecycle hook returns non-2xx, Platz still writes the row to the database, but logs the failure. There's no automatic rollback. The chart's pod is responsible for reconciliation — if it didn't get a `create` hook but later sees the resource exist in Platz, it should provision; if it gets a `delete` hook for something it doesn't know about, it should no-op.

This eventual-consistency model is intentional: it survives the chart's pod being down briefly.

## Lifecycle without hooks

If you don't set `lifecycle.create.target` etc., resources are pure database records. The chart's pod can still poll Platz's API to discover what resources it should be managing and reconcile from scratch each time. Some teams find this simpler than handling individual create/update/delete callbacks.

## Cross-deployment references

Other charts can reference your chart's resources via `CollectionSelect`:

```yaml
# in another chart's values-ui.yaml
inputs:
  - id: target_shop
    type: CollectionSelect
    label: Target Shop
    collection:
      DeploymentResources:
        filters:
          type: shop
```

The dropdown shows every `shop`-type resource in the current env, regardless of which deployment owns it. When the user picks one, the resource's ID is stored in the input value; outputs can extract specific properties via `FieldProperty`:

```yaml
outputs:
  values:
    - path: [shop, name]
      value:
        FieldProperty:
          input: target_shop
          property: name
    - path: [shop, opening_hour]
      value:
        FieldProperty:
          input: target_shop
          property: opening_hour
```

The available properties are whatever you wrote to `outputs.values` in the resource type's own `values_ui`. So the resource type's outputs define both _what's stored in the database_ and _what other charts can extract via FieldProperty_. Worth thinking through up front.

## Lifecycle: resource type addition / removal

When you push a new chart version that adds or changes resource types:

- **Added types** appear in the env-nav tab automatically once the chart-discovery worker ingests the new chart. Existing deployments of the old chart version don't see the new type until they upgrade.
- **Removed types** disappear from the nav, but existing resource instances remain in the database. They become orphaned — visible to admins via direct database access but not selectable in any UI dropdown.

For renames, retire the old type and add a new one. There's no in-place rename of a resource type.

## Caveats

- **`key` is the unique identifier per chart, not globally.** Two different charts can both declare `key: webhook` — they're independent resource types, each scoped to their respective deployments.
- **Resources don't have a status field.** Unlike deployments, there's no "is this resource healthy" indicator. If you need that, surface it through the owning deployment's status feature.
- **Lifecycle hooks have no retry.** A failed hook is logged once and forgotten. Don't rely on Platz to retry — reconcile from your own pod.
- **Resources don't accumulate audit log entries.** Currently CRUD on resources isn't reflected in `deployment_tasks`. Audit happens via the database's `created_at` / `updated_at` columns and the (optional) lifecycle hooks. Not great for compliance scenarios; build your own audit if you need it.
- **`spec.global: true` is rare and discouraged.** Global resources are visible across envs, which breaks env isolation. Use only for genuinely global concepts (like a tenant pool that crosses envs).
- **Resources only exist in the modern format.** There's no legacy v0 equivalent — charts using the JSON-only legacy files can't have resource types. Migrate to `platz/` directory layout to use them.
