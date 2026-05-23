---
sidebar_position: 3
---

# Secrets

Env-level **secrets** are named values stored in Platz that get surfaced to deployments through the [`CollectionSelect` input type](/docs/guide/chart-ext/inputs#collectionselect) and rendered into Kubernetes Secret resources at deploy time.

Use them for shared credentials that multiple deployments need to reference: database passwords, third-party API keys, signing keys, etc. They're keyed by a free-form **collection name** and a **secret name**, so you can group related secrets together (`db-creds.password`, `db-creds.user`, `db-creds.host`).

## When to use Platz secrets vs other options

Platz secrets are right for values that:

- Multiple deployments in the same env need to reference.
- A team wants to centrally manage and rotate.
- The chart's `values-ui.yaml` exposes via a `CollectionSelect` input.

They're **not** right for:

- **Single-deployment-only secrets.** Those should go directly into the deployment's config, either through a regular `text` input with `secret: true` set, or through a literal value in `values_override`.
- **Values that auto-rotate.** Platz secrets don't refresh from anywhere — you set them, they stay. For cloud-managed rotating secrets (AWS Secrets Manager, Vault), the chart's pod should fetch them at runtime via IRSA / sidecar / init container.
- **Cluster-level TLS material.** Use cert-manager or the cluster operator's TLS pipeline, not Platz secrets, for TLS certificates.

## How secrets surface to deployments

The flow:

1. An env admin creates secrets at `/envs/<env>/settings/secrets`, organized by collection name.
2. A chart author defines an input in `values-ui.yaml` like:
   ```yaml
   - id: db_password
     type: CollectionSelect
     label: Database Password
     collection: db-creds
   ```
3. When a user creates a deployment of that chart, the input renders as a dropdown showing the secret names in the `db-creds` collection.
4. The user picks one. Platz remembers the _name_ of the selected secret in `deployment.config`, not its value.
5. At install/upgrade time, Platz resolves the name to the current value and renders a Kubernetes `Secret` resource in the deployment's namespace. The chart's pods mount or reference the secret as usual.

Two implications:

- **Rotating a secret in Platz** automatically propagates to deployments on their next upgrade. Existing pods keep using the old value (because the Kubernetes Secret in their namespace doesn't change until the next helm install/upgrade).
- **Deleting a secret in Platz** doesn't crash deployments that reference it — but the next upgrade will fail because the resolved value is gone. Delete with care.

## The Secrets page

`/envs/<env>/settings/secrets` (env admins only) is grouped by collection. Each collection card shows:

- Collection name.
- List of secrets in the collection, with names and last-updated timestamps.
- An **Add Secret** button on the first collection card (creates a new collection and a first secret in it).

### Adding a secret

1. Click **Add Secret**.
2. Pick a collection (existing or new). Collection names are free-form strings; pick something that means something to your chart authors.
3. Give the secret a name. Names within a collection must be unique. Names _across_ collections can repeat (you can have `db-creds.password` and `cache-creds.password`).
4. Enter the value. The input is masked by default; nothing about the value is constrained — Platz stores it verbatim.

### Editing secret contents

Use **Change Secret Contents** on a secret row. Old value is overwritten; there's no history. Deployments that reference this secret get the new value on their next upgrade.

### Renaming a secret

Use **Rename Secret**. ⚠️ Deployments referencing the secret remember it by name, so renaming breaks those references — their next upgrade will fail with a "secret not found" error. Either:

- Rename, then update each affected deployment to point at the new name.
- Don't rename. Create a new secret with the new name, repoint deployments, delete the old one.

### Deleting a secret

**Delete Secret** removes the row. Deployments referencing it break on next upgrade. There's no soft-delete; deletion is permanent.

## How secrets become Kubernetes Secrets

When a deployment is installed or upgraded, Platz looks at the chart's `values-ui.yaml` outputs section. Outputs of type `secrets` produce Kubernetes Secret resources:

```yaml
# in values-ui.yaml
outputs:
  values:
    - path: [config, db, password_ref]
      value:
        FieldValue:
          input: db_password   # the name of the selected secret
  secrets:
    db-credentials:                # the K8s Secret name
      DB_PASSWORD:
        FieldProperty:
          input: db_password
          property: value          # extracts the secret's actual value
```

Platz creates a Kubernetes Secret in the deployment's namespace named `db-credentials` with a single key `DB_PASSWORD` whose value is the actual secret value (not the secret name). The chart's templates can `envFrom: { secretRef: { name: db-credentials } }` to inject it as an env var.

The chart author decides the K8s Secret name and key structure. The Platz secret is the source; the K8s Secret is the rendered form. See [Outputs](/docs/guide/chart-ext/outputs) for the full schema.

## Filtered collections

A chart author can constrain a `CollectionSelect` to only show secrets matching specific filters. For example, a chart that needs an SMTP password might only want to see secrets with a `provider` field set to `smtp`:

```yaml
- id: smtp_password
  type: CollectionSelect
  label: SMTP Password
  collection:
    Secrets:
      filters:
        provider: smtp
```

This requires extending the secret with extra metadata fields. Currently Platz secrets are flat (`name` + `value` only) — filtered collections work against richer collection types like deployments and deployment resources, not against plain secrets. If you need filtered secret selection, lean on the deployment resources mechanism instead (see [Resources](/docs/guide/envs/resources)).

## Reinstall-on-secret-change

When the chart's `features.yaml` has `reinstall_dependencies: true`, changing the value of a secret triggers a `Reinstall` task on every deployment that references it. This propagates new secret values to running pods without needing a manual upgrade.

The default is `reinstall_dependencies: true`. To opt out (rare — usually you want the auto-reinstall), set it to `false` in the chart's features.

## Caveats

- **Secrets are stored in plaintext in the database.** Encryption at rest is the operator's job (RDS encryption, Postgres `pg_crypto`, full-disk encryption on a self-managed Postgres). Platz doesn't add an app-level encryption layer.
- **Anyone with database access can read secrets.** Treat database read access as equivalent to secret read access. Restrict access accordingly.
- **The API never returns secret values in responses.** The frontend can only request "is the secret set?", not "what's its value?" — values only flow through the secret-rendering path at helm install time.
- **A secret with no deployments using it is invisible to the system.** It costs nothing to leave around, but it's also not surfaced anywhere useful. Delete unused ones to keep the secrets page tidy.
- **Don't put binary data in secrets.** The value column is a UTF-8 string. For binary secrets (TLS keys, signed JWT private keys), base64-encode before storing and decode in the chart's template.
- **No audit log of secret changes.** You can see who created or modified a secret by looking at the database's `created_at` / `updated_at` columns, but there's no user attribution. If you need a paper trail for compliance, audit at the database layer (PostgreSQL's `pg_audit`).
