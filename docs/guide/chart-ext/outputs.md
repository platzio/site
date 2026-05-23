---
sidebar_position: 3
---

# Outputs

The `outputs` section of `values-ui.yaml` is what turns submitted form values into Helm values and Kubernetes Secrets. Inputs collect data from the user; outputs map that data into the shape Helm expects.

Two kinds of outputs:

- **`outputs.values`** — an array describing where each piece of data ends up in the Helm values tree.
- **`outputs.secrets`** — a map describing which Kubernetes Secrets to create in the deployment's namespace, and what their contents should be.

## `outputs.values`

Each entry has a `path` (where in the Helm values tree) and a `value` (which input value to put there).

```yaml
outputs:
  values:
    - path: [config, host]
      value:
        FieldValue:
          input: hostname
    - path: [config, port]
      value:
        FieldValue:
          input: port
    - path: [config, database, password_ref]
      value:
        FieldValue:
          input: db_password_secret
```

Given user inputs `hostname=api.example.com`, `port=8080`, `db_password_secret=db-creds.main`, the resulting Helm values for `helm install` are:

```yaml
config:
  host: api.example.com
  port: 8080
  database:
    password_ref: main
```

The `path` is an array of strings — each element is one level down in the YAML tree. Use as many levels as you need.

## Value sources

There are two ways to source a value:

### `FieldValue`

Takes the entire input value verbatim.

```yaml
- path: [replicaCount]
  value:
    FieldValue:
      input: replica_count
```

Use for plain inputs (text, number, checkbox), array inputs (the entire array lands at the path), and CollectionSelect inputs (the selected item's ID or name lands at the path).

### `FieldProperty`

Extracts a single property from a CollectionSelect input. Used when the user picks a _thing_ (a deployment, a resource, a secret) and you want a specific attribute of that thing rather than its identifier.

```yaml
- path: [config, database, hostname]
  value:
    FieldProperty:
      input: database_deployment
      property: ingress_hostname

- path: [config, database, port]
  value:
    FieldProperty:
      input: database_deployment
      property: port
```

`database_deployment` is a `CollectionSelect` over `Deployments`. When the user picks a postgres deployment, `FieldProperty` extracts the deployment's `ingress_hostname` and `port` and places them at the respective paths.

For arrays of CollectionSelect, `FieldProperty` produces an array of properties — one per selected item:

```yaml
- id: regions
  type: array
  itemType: CollectionSelect
  collection: regions

# in outputs:
- path: [region_hostnames]
  value:
    FieldProperty:
      input: regions
      property: hostname
```

If the user picks three regions, `region_hostnames` becomes a YAML array of three hostnames.

Which properties are available depends on the collection type:

- **Env secrets** — `value` (the actual secret value).
- **Deployments** — `id`, `name`, `kind`, `ingress_hostname`, `cluster_id`, etc. (the deployment row's fields).
- **Deployment resources** — `id`, `name`, plus any fields defined in the resource's `values-ui.yaml`.

The exact list depends on the chart-ext crate version. Refer to `platz_chart_ext::UiSchemaCollections` for the canonical list.

## Path syntax

Paths are arrays of strings. Most strings are object keys, but a few special tokens manipulate arrays:

| Token   | Meaning                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `<key>` | Object key — descend into the object at that key, creating an empty object if it doesn't exist.                          |
| `"[N]"` | Array index (N is a number) — index into an array, creating empty entries up to N.                                       |
| `"[+]"` | Append — add a new element at the end of the array. Each `[+]` in the same output sequence creates a new element.        |
| `"[=]"` | Reference last appended element — descend into the most recently appended element (or create one if the array is empty). |

The bracket tokens **must be quoted** in YAML — `"[+]"`, not `[+]` (the latter is YAML flow sequence syntax).

Example: building an array of objects from a CollectionSelect array.

```yaml
inputs:
  - id: tenants
    type: array
    itemType: CollectionSelect
    collection: tenants

outputs:
  values:
    - path: [config, tenants, "[+]", id]
      value:
        FieldProperty:
          input: tenants
          property: id
    - path: [config, tenants, "[=]", name]
      value:
        FieldProperty:
          input: tenants
          property: name
```

For each tenant the user picks, this appends `{id: ..., name: ...}` to `config.tenants[]`. The `[+]` appends, then `[=]` references the just-appended element.

The 1024-element ceiling: if your inputs produce more than 1024 array elements, the surplus is silently dropped. This is a safety net against runaway inputs, not a documented feature you should rely on.

## `outputs.secrets`

Each entry produces a Kubernetes Secret in the deployment's namespace.

```yaml
outputs:
  secrets:
    db-credentials:
      DB_HOST:
        FieldValue:
          input: db_hostname
      DB_PORT:
        FieldValue:
          input: db_port
      DB_PASSWORD:
        FieldProperty:
          input: db_password_secret
          property: value
    api-keys:
      STRIPE_KEY:
        FieldProperty:
          input: stripe_secret
          property: value
```

Result: two Kubernetes Secrets in the deployment's namespace.

- `db-credentials` with keys `DB_HOST`, `DB_PORT`, `DB_PASSWORD`.
- `api-keys` with key `STRIPE_KEY`.

The chart's templates reference these secrets by name and key (typically via `envFrom: { secretRef: { name: db-credentials } }` or by reading the keys individually).

Secret values are always serialized to strings. If the source is a number, it's converted via Rust's `Display` impl.

### Optional secrets

If a secret entry's source input is hidden (via `showIf`) and not required, the corresponding key is skipped — but the Secret itself is still created if any other key resolved. If _all_ keys are skipped, the Secret is not created at all (Platz doesn't emit empty Kubernetes Secrets).

This means you can conditionally include keys:

```yaml
inputs:
  - id: use_tls
    type: Checkbox
  - id: tls_cert
    type: text
    sensitive: true
    showIf:
      "===":
        - var: use_tls
        - true

outputs:
  secrets:
    app-tls:
      TLS_CERT:
        FieldValue:
          input: tls_cert
```

When `use_tls` is false, `tls_cert` is hidden, no `TLS_CERT` value resolves, and `app-tls` is not created. When `use_tls` is true, `app-tls` contains the cert.

## Putting it together

A realistic example: a chart that needs to know its host, point at a Postgres deployment, and store an API key.

```yaml
apiVersion: platz.io/v1beta1
kind: ValuesUi

inputs:
  - id: hostname
    type: text
    label: Hostname
    required: true

  - id: postgres_deployment
    type: CollectionSelect
    label: Postgres Deployment
    collection:
      Deployments:
        filters:
          kind: postgres
    required: true

  - id: api_key
    type: CollectionSelect
    label: API Key
    collection: api-keys

outputs:
  values:
    - path: [hostname]
      value:
        FieldValue:
          input: hostname

    - path: [database, host]
      value:
        FieldProperty:
          input: postgres_deployment
          property: ingress_hostname

    - path: [database, port]
      value:
        FieldProperty:
          input: postgres_deployment
          property: port

  secrets:
    app-config:
      API_KEY:
        FieldProperty:
          input: api_key
          property: value
```

What happens at install time:

1. The user fills in the form, picking `payments-prod` as the postgres deployment and `stripe-prod` as the API key.
2. Platz looks up `payments-prod` and extracts its `ingress_hostname` (`postgres-payments-prod.example.com`) and `port` (5432).
3. Platz looks up `stripe-prod` and extracts its `value` (the actual API key).
4. Platz constructs the helm values: `{hostname: <user-input>, database: {host: "postgres-payments-prod.example.com", port: 5432}}`.
5. Platz creates a Kubernetes Secret `app-config` with key `API_KEY` set to the resolved Stripe key.
6. Platz runs `helm install` with the constructed values.

## Caveats

- **Outputs are evaluated in order.** Array operations (`[+]`, `[=]`) depend on this. Don't reorder entries unless you understand the consequences.
- **Outputs that reference hidden inputs silently skip.** No error, no warning — the output just isn't produced. This is the right behavior for conditional outputs but a footgun for typos: if you write `input: hostnam` (missing the `e`), the output is "skipped because input not provided" rather than a clear error.
- **Numeric values become strings in secrets.** A `number` input wired into `outputs.secrets` ends up as `"5"` not `5`. The chart's pod reads it as a string regardless.
- **Path components are strings, not paths.** Don't write `path: ["a.b.c"]` expecting Platz to split on dots — it won't. Use `path: [a, b, c]`.
- **The default Helm `values.yaml` is still in effect.** Outputs don't replace `values.yaml` — they're a layer applied on top. If your chart has a default value at `replicaCount: 1` in `values.yaml` and your outputs don't write to that path, the chart sees `replicaCount: 1`. Outputs _override_ defaults where they're written; they don't _replace_ the whole values tree.
- **`values_override` runs after outputs.** The owner's raw YAML override sits on top of everything. If an override sets `database.host: <something>`, it wins over the FieldProperty resolution. This is the design — it's the escape hatch.
- **Secret values can't reference other secrets.** A `FieldProperty` of a secret extracts the secret's value, full stop. You can't chain (e.g., reference a secret whose value names another secret). Resolve fully in one step.
