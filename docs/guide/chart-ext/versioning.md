---
sidebar_position: 7
---

# Versioning

Chart Extension schemas have evolved over time. Platz supports three versions; this page explains the version history, how Platz picks which one to read, and how to migrate older charts to the current format.

## Version timeline

| Version | apiVersion | File format | File location | Status |
| --- | --- | --- | --- | --- |
| **v0** | none (implicit) | JSON | chart root (`values.ui.json`, `actions.schema.json`, `features.json`) | Legacy. Maintained for backwards compatibility only. |
| **v1beta1** | `platz.io/v1beta1` | YAML | `platz/` subdirectory (`platz/values-ui.yaml`, `platz/actions.yaml`, `platz/features.yaml`, `platz/resources.yaml`) | Stable. Default for most charts. |
| **v1beta2** | `platz.io/v1beta2` | YAML | `platz/features.yaml` only — other files still use v1beta1 | The current latest, for charts that need the new ingress / display configuration. |

Note that **only `features.yaml` has a v1beta2** — the other files haven't needed schema changes since v1beta1.

## How Platz picks the version

When chart-discovery sees a chart:

1. It checks for the existence of a `platz/` directory. If present → modern format.
2. If absent, it falls back to root-level JSON files (`values.ui.json`, etc.) → legacy v0 format.

You can't mix: a chart with a `platz/` directory has its root-level JSON files ignored. So when migrating, move all four files at once, don't leave legacy files behind.

For each individual file in the modern format, the `apiVersion` header determines the schema version:

```yaml
apiVersion: platz.io/v1beta1   # or v1beta2 for features.yaml
kind: ValuesUi
# ... rest of the file ...
```

If a file has a v1beta2 `apiVersion` but uses v1beta1 fields (or vice versa), Platz returns a parse error. Mix-and-match isn't supported.

## Migrating v0 → v1beta1

The mechanical changes:

1. **Move files.** `values.ui.json` → `platz/values-ui.yaml`, `actions.schema.json` → `platz/actions.yaml`, `features.json` → `platz/features.yaml`.
2. **Convert JSON to YAML.** Most JSON is also valid YAML, but the YAML formatting will be more readable. Run `yq -y . values.ui.json > platz/values-ui.yaml` or similar.
3. **Add `apiVersion` and `kind` headers** to each file:
   - `platz/values-ui.yaml`: `apiVersion: platz.io/v1beta1`, `kind: ValuesUi`.
   - `platz/features.yaml`: `apiVersion: platz.io/v1beta1`, `kind: Features`. Wrap the body in `spec:`.
   - `platz/actions.yaml`: convert the v0 `{"actions": [...]}` envelope into a list of resources, each with `apiVersion: platz.io/v1beta1`, `kind: Action`, and the action body under `spec:`.
4. **Test the result** by pushing the chart to a non-production registry and checking that it appears in Platz without errors. If chart-discovery logs a parse error, the schema didn't match — read the error and fix the file.

There are no semantic changes between v0 and v1beta1 — only the format and location. A chart migrated as above behaves identically.

### v0 actions wrapper conversion

A v0 `actions.schema.json` looks like:

```json
{
  "schema_version": 1,
  "actions": [
    {
      "id": "rotate-keys",
      "title": "Rotate Keys",
      ...
    },
    {
      "id": "reindex",
      "title": "Reindex",
      ...
    }
  ]
}
```

The v1beta1 equivalent is a YAML list of `Action` resources:

```yaml
- apiVersion: platz.io/v1beta1
  kind: Action
  spec:
    id: rotate-keys
    title: Rotate Keys
    # ...

- apiVersion: platz.io/v1beta1
  kind: Action
  spec:
    id: reindex
    title: Reindex
    # ...
```

The `schema_version` field is gone — versioning is now per-resource via `apiVersion`.

## Migrating v1beta1 → v1beta2

The only file that has a v1beta2 schema is `features.yaml`. The migration is small:

### Ingress

```yaml
# v1beta1
apiVersion: platz.io/v1beta1
kind: Features
spec:
  standard_ingress: true
```

becomes

```yaml
# v1beta2
apiVersion: platz.io/v1beta2
kind: Features
spec:
  ingress:
    enabled: true
    hostname_format: KindAndName   # the v1beta1 default
```

`hostname_format` is new in v1beta2. The default (`KindAndName`) matches v1beta1's implicit behaviour, so existing charts retain their hostnames after migration if you stick with the default.

### Display

v1beta2 adds the `display` section. v1beta1 has no equivalent:

```yaml
# v1beta2 only
spec:
  display:
    name: DeploymentName
    icon:
      font_awesome: rocket
```

Add this to opt into the new features. If you don't, the deployment list uses default display behaviour (deployment name as label, registry-level icon).

### Everything else

The other fields in `features.yaml` (`cardinality`, `reinstall_dependencies`, `node_selector_paths`, `tolerations_paths`, `status`) are unchanged between v1beta1 and v1beta2. You can leave them as-is — just bump the `apiVersion` line.

## What `deny_unknown_fields` means in practice

Some structs in the chart-ext crate use `#[serde(deny_unknown_fields)]`, which means extra fields cause a parse error. The affected ones (as of writing):

- `UiSchemaV0` (the `values.ui.json` legacy schema body).
- `ChartExtDeploymentDisplay` and its inner types (the v1beta2 `display` section).

Other structures silently ignore extra fields. The practical implication: typos in field names usually don't error out, they just silently take no effect. This is a footgun — if you set `initialvalue: 5` (lowercase) instead of `initialValue: 5`, the form opens empty rather than initialized to 5.

**Always test your chart in a non-production env after schema edits.** Don't trust that the parse succeeded — verify the form actually behaves as expected.

## When to use which version

For new charts:

- **`platz/` directory + v1beta1 for everything except features**, **v1beta2 for features.** This is the current recommendation.
- Use v1beta2 unless you have a specific reason not to.

For existing charts:

- **v0 still works** — there's no deprecation timeline. But new features (resource types, the v1beta2 display section) are unavailable.
- **Migrate when you need a new feature**, not for its own sake. The migration is a sharp edge if the chart is in production.

## Caveats

- **Mixing v0 and modern is impossible.** The presence of `platz/` decides for the whole chart. There's no per-file override.
- **The `apiVersion` is a literal string match.** `platz.io/v1beta1` works; `platz.io/v1Beta1`, `platz.io/v1beta-1`, `platz.io/v1` don't.
- **Resource types only exist in modern format.** Migrating v0 → v1beta1 is a prerequisite for using `resources.yaml`.
- **No automatic migration tool.** The conversion is a manual process. For large charts with many actions, scripting the conversion with `yq` is a one-off effort.
- **Future versions (`v1beta3`, etc.) will be additive.** Past behaviour suggests the project bumps `apiVersion` only when adding new fields, not when changing existing ones. Existing v1beta2 files should keep working indefinitely.
