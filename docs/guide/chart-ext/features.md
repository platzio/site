---
sidebar_position: 4
---

# Features

`platz/features.yaml` is where you declare chart-level behaviour: how many instances of this chart can exist per cluster, whether the chart should get an auto-generated ingress, whether Platz should poll a status endpoint, what icon to show in the deployment list, where to inject env-level node selectors and tolerations, and a few other knobs.

This page documents every supported field with examples. Most charts use only a subset — declare what you need and omit the rest.

## File structure

```yaml
apiVersion: platz.io/v1beta2
kind: Features
spec:
  ingress:
    enabled: true
    hostname_format: KindAndName
  status:
    endpoint: standard_ingress
    path: /api/v1/platz-status
    refresh_interval_secs: 15
  cardinality: Many
  reinstall_dependencies: true
  display:
    name: DeploymentName
    icon:
      font_awesome: rocket
  node_selector_paths:
    - [postgresql, primary, nodeSelector]
  tolerations_paths:
    - [postgresql, primary, tolerations]
```

The `apiVersion` matters. `platz.io/v1beta2` is the newest. `platz.io/v1beta1` is older and uses a flat `standard_ingress: <bool>` rather than the nested `ingress` object. See [Versioning](/docs/guide/chart-ext/versioning) for the migration path.

## `cardinality`

How many deployments of this chart can exist in a given cluster.

```yaml
spec:
  cardinality: OnePerCluster   # or Many (default)
```

- **`Many`** — Multiple deployments per cluster. Users name each one. The default.
- **`OnePerCluster`** — Singleton. Users can only install one instance per cluster, and the deployment name is implicit (equals the kind name). Used for cluster-wide infrastructure like ingress controllers, cert-manager, or kube-state-metrics.

If you specify `OnePerCluster` and a deployment already exists on the cluster, attempting to create another one fails with a validation error.

## `ingress`

Controls the [Standard Ingress feature](/docs/guide/admin/ingress) — Platz's auto-injection of an `ingress` block into the chart's helm values.

```yaml
spec:
  ingress:
    enabled: true
    hostname_format: KindAndName
```

- `enabled` — `true` to opt in. When `true`, Platz constructs an `ingress` object from the deployment's cluster ingress settings and injects it into the helm values at `ingress.*`. When `false` (default), Platz doesn't touch anything ingress-related.
- `hostname_format` — How the hostname is constructed from the deployment's identity. Two options:
  - `KindAndName` (default) — `<kind>-<deployment-name>.<cluster-domain>`. Used for installs with many kinds where deployment names might collide across kinds.
  - `Name` — `<deployment-name>.<cluster-domain>`. Used when deployment names are already unique (e.g., per-customer deployments).

For `OnePerCluster` charts, the hostname is just `<kind>.<cluster-domain>` regardless of the format (because there's no name).

The injected helm values look something like:

```yaml
ingress:
  enabled: true
  hostname: my-deployment.example.com
  className: nginx
  tlsSecretName: letsencrypt-prod
```

The chart's templates need to render an Ingress resource from these values. The `helm create` scaffold's `templates/ingress.yaml` is a fine starting point — adjust to match.

In v1beta1 the equivalent setting was just `standard_ingress: true|false`. v1beta2 adds the `hostname_format` choice.

## `status`

Wires up the chart's [Status feature](/docs/guide/deployments/status). When enabled, the `platz-status-updates` worker polls a URL on the deployment's standard ingress and renders the response in the UI.

```yaml
spec:
  status:
    endpoint: standard_ingress
    path: /api/v1/platz-status
    refresh_interval_secs: 15
```

- `endpoint` — Currently must be `standard_ingress`. Future versions may support other transports.
- `path` — The path appended to the standard ingress hostname to form the full URL.
- `refresh_interval_secs` — Polling interval. Default 15s. Don't go below 5; Platz will accept it but you're burning CPU for no gain.

The Status feature requires the `ingress` feature to also be enabled (because that's where the hostname comes from). Without ingress, the status URL has no host and polling silently doesn't happen.

Currently this field exists only in v1beta1 (it didn't change in v1beta2). The pre-v1beta1 v0 format used `status` as a top-level field of the same shape.

## `display`

Customizes how the deployment shows up in the UI list (v1beta2 only).

```yaml
spec:
  display:
    name: DeploymentName
    icon:
      font_awesome: rocket
```

### `display.name`

What text to show as the deployment's name in the list and detail pages.

- `DeploymentName` — the literal deployment name the user gave it. The default.
- `{InputField: {name: <input_id>}}` — the value of a specific input field. Useful when a deployment's "user-visible name" is different from its identifier.

Example with input-driven name:

```yaml
inputs:
  - id: customer_name
    type: text
    label: Customer Name
    required: true

# in features.yaml:
spec:
  display:
    name:
      InputField:
        name: customer_name
```

The deployment list shows the value of `customer_name` rather than the technical deployment name.

### `display.icon`

A FontAwesome icon name to show in the list row.

```yaml
spec:
  display:
    icon:
      font_awesome: rocket
```

The string is the FontAwesome class name without the `fa-` prefix — `rocket`, `database`, `cloud`, `cube`, etc. Browse [fontawesome.com](https://fontawesome.com/icons) for options. The icon set bundled with Platz is the FontAwesome Free pack.

If you don't set an icon at the chart level, the icon falls back to whatever's set on the registry (via the **Set Icon** action on `/admin/helm-registries/<id>`).

## `reinstall_dependencies`

Controls whether Platz auto-reinstalls deployments when their referenced secrets or deployment dependencies change.

```yaml
spec:
  reinstall_dependencies: true   # default
```

- `true` — When a secret referenced by this deployment is modified, Platz enqueues a `Reinstall` task. When a deployment this one references (via `CollectionSelect`) is re-deployed, ditto.
- `false` — No auto-reinstall. Operators must trigger upgrades manually.

The default is `true` because it's the safer behaviour: pods that need fresh secrets get them automatically. Set to `false` if your chart's pods can pick up secret rotations through external means (a sidecar, a periodic refresh) and you don't want the helm churn.

## `node_selector_paths` and `tolerations_paths`

Where to inject the env-level node selector and tolerations.

By default, Platz injects them at the top level of the helm values:

```yaml
nodeSelector:
  <env-level-content>
tolerations:
  <env-level-content>
```

If your chart wraps everything in a subchart (e.g., the chart embeds Bitnami's `postgresql` subchart which has its own `postgresql.primary.nodeSelector`), the top-level injection doesn't propagate. Specify additional paths to inject into:

```yaml
spec:
  node_selector_paths:
    - [postgresql, primary, nodeSelector]
    - [postgresql, readReplicas, nodeSelector]
  tolerations_paths:
    - [postgresql, primary, tolerations]
    - [postgresql, readReplicas, tolerations]
```

Platz writes the env-level selector / tolerations to every path you list, in addition to the top-level injection. The chart's own values for those paths are overwritten if they exist.

If the env has no node selector / tolerations set, no injection happens — even at the top level.

## YAML quick reference

```yaml
apiVersion: platz.io/v1beta2
kind: Features
spec:
  cardinality: Many | OnePerCluster
  ingress:
    enabled: true | false
    hostname_format: Name | KindAndName
  status:
    endpoint: standard_ingress
    path: <string>
    refresh_interval_secs: <int>
  display:
    name: DeploymentName | {InputField: {name: <id>}}
    icon:
      font_awesome: <name>
  reinstall_dependencies: true | false
  node_selector_paths:
    - [<path>, <segment>, ...]
  tolerations_paths:
    - [<path>, <segment>, ...]
```

## Caveats

- **`display.name` is purely cosmetic.** The deployment's actual name (used in URLs, in Helm release naming, in DNS) doesn't change. If you want different display vs technical names, this is the knob.
- **`display.icon` font_awesome name is the class name without the `fa-` prefix.** A common mistake.
- **`OnePerCluster` enforcement is at deployment-create time.** If you change a chart from `Many` to `OnePerCluster` while multiple instances already exist, the existing instances keep running. The constraint only blocks *new* creates.
- **Status polling without ingress is silent.** If you enable Status but not Ingress, no polling happens, and the UI shows no status. There's no warning.
- **`node_selector_paths` overwrites, not merges.** If your chart's `values.yaml` has its own node selector under `postgresql.primary.nodeSelector`, listing that path in `node_selector_paths` replaces it with the env's selector at install time. Chart authors should choose: either the chart owns the selector, or Platz does, not both.
- **The `v0` features.json (legacy) uses snake_case fields** (`standard_ingress`, `node_selector_paths`). The modern v1beta1/v1beta2 YAML format uses camelCase wrapper kinds but mostly preserves snake_case for the leaf fields (`hostname_format`, `refresh_interval_secs`). Inconsistent but historical.
- **No way to declare chart dependencies in features.** "This chart needs another chart of kind X to be installed first" isn't expressible. You'd handle that in the chart's UI (a required `CollectionSelect` over `Deployments`) or in the chart's own pod (failing fast if the dependency isn't reachable).
