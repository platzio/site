---
sidebar_position: 2
---

# Inputs

`platz/values-ui.yaml` defines the form users fill in when creating or editing a deployment of your chart. Each entry in the top-level `inputs` list becomes a form field. Platz collects the submitted values, resolves any references (collection lookups, conditional inputs), and feeds them into the [outputs](/docs/guide/chart-ext/outputs) section to produce Helm values and Kubernetes Secrets.

## File structure

```yaml
apiVersion: platz.io/v1beta1
kind: ValuesUi
inputs:
  - id: ...
    type: ...
    # ...
outputs:
  values: [ ... ]
  secrets: { ... }
```

The `apiVersion` and `kind` headers are required for the modern format. Without them, Platz reads the file as legacy v0 — which is JSON-only, so a YAML file without the headers fails to parse.

This page covers `inputs`. See [Outputs](/docs/guide/chart-ext/outputs) for the rest.

## Common fields

Every input shares these fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | Yes | The identifier for this input. Used in `outputs` and in conditional `showIf` references. Must be unique within the file. |
| `type` | string | Yes | The input type (see below). Or `array` for an array of one of those types, with `itemType` set. |
| `label` | string | Yes | The human-readable label shown above the field. |
| `required` | boolean | No (default `false`) | If `true`, the form can't be submitted without a value. |
| `initialValue` | any | No | The pre-filled value when creating a new deployment. The shape depends on the type. |
| `helpText` | string | No | A short description rendered below the field. Markdown not supported; plain text only. |
| `showIf` | object | No | A JsonLogic expression that determines whether this field is shown. See [Conditional inputs](#conditional-inputs). |
| `showIfAll` | array | No | Legacy alternative to `showIf` — a simple list of `{field, value}` pairs all of which must match. Prefer `showIf`. |
| `sensitive` | boolean | No (default `false`) | If `true`, the field renders masked in the UI. Common for passwords, API keys. |

The field-name spelling is **camelCase** — `initialValue`, not `initial_value`. The Rust crate uses serde with camelCase rename, so snake_case in your YAML fails to parse silently (the field is treated as missing).

## Input types

The complete list of input types Platz supports. Type names are case-insensitive (the underlying parser is `ascii_case_insensitive`), so `Text`, `text`, `TEXT` all work — but canonical spelling helps readability.

### `text`

A single-line text input.

```yaml
- id: domain_name
  type: text
  label: Domain Name
  placeholder: myservice.example.com
  required: true
```

The Helm value is a string. Use `sensitive: true` for passwords / API keys.

### `number`

A numeric input. Accepts integers and decimals.

```yaml
- id: replica_count
  type: number
  label: Replica Count
  required: true
  initialValue: 1
  minimum: 1
  maximum: 10
```

Number-specific fields:

- `minimum` — inclusive lower bound.
- `maximum` — inclusive upper bound.
- `step` — UI increment (parsed but currently not enforced in form validation).

The Helm value is a number (not a string). Use this for replica counts, port numbers, timeouts.

### `Checkbox`

A boolean toggle.

```yaml
- id: enable_metrics
  type: Checkbox
  label: Enable Metrics
  initialValue: true
```

The Helm value is `true` or `false`.

### `RadioSelect`

A single-select from a fixed list of options.

```yaml
- id: log_level
  type: RadioSelect
  label: Log Level
  initialValue: info
  options:
    - value: debug
      label: Debug
      helpText: Verbose output. Not for production.
    - value: info
      label: Info
    - value: warn
      label: Warnings only
    - value: error
      label: Errors only
```

Each option has:

- `value` (required) — the value that ends up in the Helm values when selected. Can be any JSON value (string, number, bool).
- `label` (optional) — what's shown in the radio button label. Defaults to the `value` rendered as a string.
- `helpText` (optional) — a small description rendered next to the option.

### `CollectionSelect`

A dropdown that pulls its options from a Platz-managed collection. Three common collections:

**Env secrets** — pick a secret name from a collection.

```yaml
- id: db_password
  type: CollectionSelect
  label: Database Password
  collection: db-creds
```

The dropdown lists every secret in the `db-creds` collection. The Helm value is the *name* of the selected secret; outputs resolve the name to the actual value at install time. See [Secrets](/docs/guide/envs/secrets).

**Deployment resources** — pick a resource of a specific type.

```yaml
- id: shop
  type: CollectionSelect
  label: Shop
  collection:
    DeploymentResources:
      filters:
        type: shop
```

The dropdown lists every resource of type `shop` in the current env. Submission stores the resource ID; outputs resolve to the resource's values. See [Resources](/docs/guide/envs/resources).

**Deployments** — pick another deployment in the same env, optionally filtered to a specific kind.

```yaml
- id: database_deployment
  type: CollectionSelect
  label: Database Deployment
  collection:
    Deployments:
      filters:
        kind: postgres
```

The dropdown lists every `postgres`-kind deployment in the env. Submission stores the deployment ID; outputs can extract specific properties (hostname, port, credentials) via `FieldProperty`.

### `DaysAndHour`

A composite input for picking a day-of-week and an hour-of-day — useful for maintenance windows and backup schedules.

```yaml
- id: backup_window
  type: DaysAndHour
  label: Backup Window
```

The Helm value is an object: `{day: <0-6>, hour: <0-23>}`.

### Arrays

Any of the above types can be made into an array by setting `type: array` and `itemType: <the type>`:

```yaml
- id: allowed_ips
  type: array
  itemType: text
  label: Allowed IPs
  initialValue:
    - 0.0.0.0/0
```

```yaml
- id: replicas_per_region
  type: array
  itemType: CollectionSelect
  label: Replica Per Region
  collection: regions
```

Users can add and remove items in the UI. The Helm value is a YAML array of the underlying type's values.

`CollectionSelect` arrays are useful when a chart needs to reference *multiple* items from a collection — e.g., a chart that runs in multiple regions.

## Conditional inputs

Inputs can be hidden based on the current values of other inputs.

### `showIf` with JsonLogic

The preferred mechanism. `showIf` takes a [JsonLogic](https://jsonlogic.com/) expression. If it evaluates to `true`, the field is shown; otherwise it's hidden.

Simple equality check:

```yaml
- id: enable_backup
  type: Checkbox
  label: Enable Backup
  initialValue: false

- id: backup_schedule
  type: DaysAndHour
  label: Backup Schedule
  showIf:
    "===":
      - var: enable_backup
      - true
```

`backup_schedule` is hidden while `enable_backup` is unchecked.

Operators commonly used in `showIf`:

| Operator | Syntax | Notes |
| --- | --- | --- |
| Strict equality | `{"===": [<left>, <right>]}` | The most common case |
| Inequality | `{"!==": [<left>, <right>]}` | "not equal to" |
| Numeric comparison | `{">": [<left>, <right>]}`, `{">=": ...}`, `{"<": ...}`, `{"<=": ...}` | |
| Logical AND | `{"and": [<expr>, <expr>, ...]}` | Variadic |
| Logical OR | `{"or": [<expr>, <expr>, ...]}` | Variadic |
| Negation | `{"!": <expr>}` | Single expression |
| Variable reference | `{"var": "<input_id>"}` | Reads another input's current value |
| String substring | `{"substr": [<string>, <start>, <length>]}` | First N chars, etc. |

Complex example:

```yaml
- id: tier
  type: RadioSelect
  label: Tier
  options:
    - value: free
    - value: paid

- id: support_email
  type: text
  label: Support Email
  required: true
  showIf:
    or:
      - "===":
          - var: tier
          - paid
      - and:
          - "===":
              - var: tier
              - free
          - ">":
              - var: replica_count
              - 5
```

The support email is shown if the user picks the `paid` tier, OR if they pick `free` but with more than 5 replicas.

### When a `required` input is hidden

If an input has `required: true` and is hidden by `showIf`, it's treated as *not provided* for output resolution. This means:

- Outputs that reference the hidden input via `FieldValue` are skipped (the output entry is omitted from the Helm values).
- The user can submit the form without filling the hidden input (because it isn't shown).

So `required: true` interacts with `showIf` to mean "required when shown". Use this for fields that only matter under certain conditions.

### `showIfAll` (legacy)

A simpler conditional mechanism: a list of `{field, value}` pairs all of which must match the current input values.

```yaml
- id: backup_schedule
  showIfAll:
    - field: enable_backup
      value: true
```

Equivalent to a `showIf` with a single `===`. Prefer `showIf` for new charts — `showIfAll` doesn't support `or`, complex logic, or numeric comparisons.

## YAML quick reference

```yaml
apiVersion: platz.io/v1beta1
kind: ValuesUi

inputs:
  # text input
  - id: <id>
    type: text
    label: <label>
    required: <bool>
    initialValue: <string>
    placeholder: <string>
    helpText: <string>
    sensitive: <bool>

  # number input
  - id: <id>
    type: number
    label: <label>
    minimum: <number>
    maximum: <number>
    step: <number>

  # Checkbox input
  - id: <id>
    type: Checkbox
    label: <label>
    initialValue: <bool>

  # RadioSelect input
  - id: <id>
    type: RadioSelect
    label: <label>
    options:
      - value: <any>
        label: <string>      # optional
        helpText: <string>   # optional

  # CollectionSelect input
  - id: <id>
    type: CollectionSelect
    label: <label>
    collection: <string-or-object>

  # DaysAndHour input
  - id: <id>
    type: DaysAndHour
    label: <label>

  # Array of any of the above
  - id: <id>
    type: array
    itemType: <text|number|Checkbox|RadioSelect|CollectionSelect|DaysAndHour>
    label: <label>
    # + type-specific fields

  # Conditional rendering
  - id: <id>
    type: <any>
    showIf:
      <jsonlogic-expression>
    showIfAll:
      - field: <other_id>
        value: <expected>

outputs:
  values: [ ... ]      # see Outputs
  secrets: { ... }     # see Outputs
```

## Caveats

- **Case sensitivity isn't great.** Type names are case-insensitive but field names are case-**sensitive**. `initialValue` works; `initialvalue` and `initial_value` silently don't.
- **The schema uses `deny_unknown_fields` on `inputs` (v0).** A typo in a field name in the legacy JSON format causes the whole file to fail to parse. The v1beta1 YAML schema is more forgiving — extra fields are silently ignored — but don't rely on that.
- **`RadioSelect` options are static.** For dynamic option lists, use `CollectionSelect`.
- **`CollectionSelect` requires `collection` to be set.** Forgetting it causes a parse error at chart-discovery time. The error is usually clear if you look at the chart-discovery pod's logs.
- **Arrays have a 1024-item ceiling for output expansion.** Inputs themselves don't have a hard limit, but outputs that produce array elements via `[+]` syntax (see [Outputs](/docs/guide/chart-ext/outputs)) silently stop appending past index 1024.
- **`showIf` and `showIfAll` can both be set on the same input.** Don't do this; only the first defined wins. Pick one.
- **`initialValue` is applied on create, not on edit.** When editing an existing deployment, the current saved value is shown, not the initialValue. This usually does the right thing, but watch out if you change `initialValue` in a chart upgrade — existing deployments don't pick it up.
