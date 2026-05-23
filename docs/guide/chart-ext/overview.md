---
sidebar_position: 1
---

# What Are Chart Extensions

A **Chart Extension** is a set of optional YAML files you bundle inside a Helm chart to give Platz richer knowledge of your service. Without them, Platz can deploy your chart — users just fill in a raw YAML values blob. With them, your chart gets:

- A **typed form** generated from `values-ui.yaml` — text fields, numbers, checkboxes, drop-downs, conditional inputs, references to env secrets and other deployments.
- A **live status display** — color-coded badge, primary metric, notices, metrics grid — when your chart's pods report status via the [Status feature](/docs/guide/deployments/status).
- **Custom actions** in the deployment's Actions menu — chart-defined operations (rotate keys, force-reindex, run migrations) callable by Platz users from the UI.
- **Resource types** for child objects your service owns — Shops, Tenants, Webhooks — managed in a separate UI tab in the env's nav.
- **Cardinality control** — declare your chart as `OnePerCluster` (singleton) or `Many` (multiple instances per cluster).
- **Display polish** — your chart's deployment list rows get an icon, a custom name format, and a primary metric.

This page is the orientation map. Each feature is covered in its own page later in this section.

## The files

There are four extension files. Place them inside your chart's directory, under a `platz/` subdirectory:

```
my-chart/
├── Chart.yaml
├── values.yaml
├── templates/
└── platz/
    ├── values-ui.yaml       # the form schema (inputs and outputs)
    ├── features.yaml        # cardinality, ingress, status, display
    ├── actions.yaml         # custom actions
    └── resources.yaml       # child resource types (optional)
```

Each file is independent: include only the ones you need. A chart that just wants a form needs only `values-ui.yaml`. A chart that ships actions but doesn't need a form is fine too.

### File naming and versions

Platz supports two file-naming schemes:

| Scheme | Location | apiVersion | Status |
| --- | --- | --- | --- |
| **Modern** | `platz/values-ui.yaml`, `platz/features.yaml`, `platz/actions.yaml`, `platz/resources.yaml` | `platz.io/v1beta1` or `platz.io/v1beta2` (features only) | Current. Use for new charts. |
| **Legacy** | `values.ui.json`, `features.json`, `actions.schema.json` (at chart root) | None — implicit | Supported for backwards compatibility. JSON only. |

If a chart has a `platz/` directory, Platz reads from it exclusively — legacy files at the chart root are ignored. So you can't mix the two; pick one.

The modern format is YAML, has explicit `apiVersion` and `kind` headers like Kubernetes resources, and supports newer features (resource types, the v1beta2 features schema). It's also more human-friendly. Use it.

See [Versioning](/docs/guide/chart-ext/versioning) for the version timeline and migration tips.

## What Platz reads, and when

When the `platz-chart-discovery` worker sees a new chart in a connected registry, it:

1. Downloads the chart tarball.
2. Looks for the `platz/` directory; if absent, falls back to root-level legacy files.
3. Parses each of the four files into typed structs.
4. Stores the parsed structs in the database alongside the chart metadata (image tag, registry, creation time).
5. Marks the chart as `available: true` so it shows up in the version picker.

Parsing happens **once at chart-discovery time**. The chart files don't get re-parsed on each install — the install uses the cached, parsed structs. This means a chart with broken YAML never makes it into the version picker; chart-discovery's logs are the place to look if your push isn't showing up.

If a chart's extension files reference a feature that doesn't validate (e.g., an input type that doesn't exist), the chart is marked `available: false` and won't be selectable in the UI. The logs will say why.

## A minimal example

The smallest useful `platz/values-ui.yaml` looks like:

```yaml
apiVersion: platz.io/v1beta1
kind: ValuesUi
inputs:
  - id: replica_count
    type: number
    label: Replica Count
    required: true
    initialValue: 1
    minimum: 1
outputs:
  values:
    - path: [replicaCount]
      value:
        FieldValue:
          input: replica_count
```

When a user creates a deployment of this chart, they see a single form field labeled "Replica Count" with an initial value of 1. On submit, Platz passes `replicaCount: <value>` to `helm install`. The chart's templates use `{{ .Values.replicaCount }}` as they would for any normal Helm value.

The form gets more useful as you add inputs — text fields for hostnames, checkboxes for feature flags, `CollectionSelect` dropdowns for picking env secrets, conditional `showIf` rules to hide irrelevant fields.

## What the extension files *can't* do

The chart-extension system is opinionated. Things it deliberately doesn't support:

- **Arbitrary Helm value transformations.** Outputs map inputs to specific Helm value paths. You can't run code to massage values; if you need that, do it in your chart's templates instead.
- **External validation.** Inputs are validated for type and required/optional. Cross-field consistency checks (e.g. "if A is set, B must also be set") have to be handled by `showIf` for visibility or by the chart's own templates failing on bad input.
- **File uploads.** Inputs are all simple JSON-serializable values. For binary data, base64 in a text field and decode in templates.
- **Dynamic option lists computed at form-render time.** `RadioSelect` options are static (defined in the YAML). For dynamic lists (e.g., "pick from current values in this external system"), use `CollectionSelect` against a [deployment resource](/docs/guide/envs/resources) — the resource list is computed at form-render time.
- **Conditional outputs.** All `outputs.values` and `outputs.secrets` entries are evaluated on every install. To conditionally produce a value, gate it on an optional input — if the input's `showIf` hides it, the corresponding output is skipped.

If you find yourself fighting these limits, you're probably in territory better handled by the chart's `templates/` than by Platz's UI layer.

## Next steps

The rest of this section drills into each file:

- [Inputs](/docs/guide/chart-ext/inputs) — the form schema. Input types, fields, conditional rendering with `showIf`/JsonLogic.
- [Outputs](/docs/guide/chart-ext/outputs) — how form inputs map to Helm values and Kubernetes Secrets.
- [Features](/docs/guide/chart-ext/features) — cardinality, ingress, status, display.
- [Actions](/docs/guide/chart-ext/actions) — custom actions in the deployment's Actions menu.
- [Resources](/docs/guide/chart-ext/resources) — declaring resource types for child objects.
- [Versioning](/docs/guide/chart-ext/versioning) — schema versions and migration.

For a worked example, the [`platzio/chart-ext`](https://github.com/platzio/backend/tree/main/chart-ext) crate ships test fixtures under `tests/charts/` — a half-dozen example charts demonstrating every feature.
