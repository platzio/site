---
sidebar_position: 3
---

# Envs

An **env** in Platz is a logical container for clusters, deployments, and the people who can touch them. You'll usually map envs to your existing operational tiers — `production`, `staging`, `dev`, `dogfood`, one per customer for multi-tenant setups, one per team for shared infrastructure.

Site admins manage envs from `/admin/envs`. Env-level admins manage *their own* env settings from `/envs/<env>/settings` — see [Permissions](/docs/guide/envs/permissions), [Secrets](/docs/guide/envs/secrets), and [Resources](/docs/guide/envs/resources) for that side.

## What an env contains

The fields on an env record:

| Field | Description |
| --- | --- |
| `name` | Display name. No length restrictions, but shorter is better — it shows up in the env switcher and in URLs. |
| `node_selector` | A JSON object that becomes the `nodeSelector` Helm value for every deployment in this env. Use this to pin all of an env's pods to specific nodes. |
| `tolerations` | A JSON array that becomes the `tolerations` Helm value for every deployment in this env. Use with taints to keep this env's workloads on dedicated nodes. |
| `auto_add_new_users` | If `true`, every new user created at OIDC signup is granted the env-level `User` role on this env. Off by default. |

There's no env-level domain, no env-level OIDC config, no env-level secrets *here* — those live on individual clusters, on the install as a whole, and on each env's own settings respectively.

## Creating envs

From `/admin/envs`:

1. Click **New Env** (or the equivalent button on the empty state).
2. Give it a name.
3. Save.

That's it. You now have an empty env. Next steps:

- Attach a cluster to it (from `/admin/clusters/<id>` or from `/envs/<env>/settings/clusters`).
- Grant yourself and your team env-level permissions (`/envs/<env>/settings/user-roles`).
- Start deploying.

## Env detail page (`/admin/envs/<id>`)

A site admin's view of a specific env has three editable cards plus a list of clusters and users.

### Env Users

A link to `/envs/<env>/settings/user-roles`, where env-level role assignments live. Site admins can also see and edit them there.

A warning appears at the top of the env page if the env has no admins — possible if you delete the last admin without picking a replacement first.

### Auto-add New Users

A toggle, on or off, that controls the `auto_add_new_users` flag. When on, the next person to log in via OIDC is automatically given env-level `User` role on this env.

The typical pattern is:

- Turn it on for your default env (the one most people should land in).
- Leave it off for sensitive envs (prod, customer-specific).

It's not retroactive — toggling it on doesn't grant existing users access. Only new signups after the toggle.

### Node Selector and Tolerations

A pair of YAML editors backed by `node_selector` and `tolerations`. When non-empty, these get merged into every Helm install/upgrade in the env:

```yaml
# What gets sent to helm
nodeSelector:
  <env's node_selector contents>
tolerations:
  <env's tolerations contents>
```

This is in addition to whatever the chart specifies in its own `values.yaml`. If a deployment's chart has explicit node selectors, the env's selectors are merged with them (Helm's last-write-wins for duplicate keys).

Charts can declare additional locations to inject node selectors and tolerations via `node_selector_paths` and `tolerations_paths` in [features.yaml](/docs/guide/chart-ext/features) — useful when a subchart (e.g. Bitnami Postgres) keeps its node selector at `postgresql.primary.nodeSelector` rather than the top-level.

## Editing envs

Env settings can be changed at any time. They take effect on the *next* helm install/upgrade for each deployment, not retroactively — a running deployment whose env's node selector just changed continues to run wherever it was scheduled until something else triggers a Helm operation on it.

To force a re-deploy across the whole env, the cleanest option is to bump each deployment by triggering a Reinstall task. There's no "redeploy all" button (yet); script it via the API if you need it often.

## Deleting envs

There's currently no "delete env" action in the UI. The closest workflow:

1. Uninstall every deployment in the env.
2. Detach every cluster from the env (`/admin/clusters/<id>` → **Change Cluster Env** → unset).
3. Remove all user permissions.
4. Drop the row in the database.

A future release may add a UI-level delete action; for now, treat env creation as long-lived.

## Multi-env patterns

A few patterns that work well:

### One env per environment (production, staging, dev)

The simplest layout. Each env gets its own clusters and its own user list. Production has a short user list and `auto_add_new_users: false`; staging has a long user list and `auto_add_new_users: true`.

### One env per team

For organisations where teams own dedicated infrastructure: `platform-team`, `data-team`, `growth-team`. Each team's env contains only their clusters. Operators (site admins) handle the cross-cutting concerns; team members are env-level admins on their own env only.

### One env per customer

For multi-tenant SaaS providers. Each customer gets a dedicated env, dedicated clusters, dedicated deployments. Use env-level user roles to give the customer's account team access to their own env and nothing else.

### Mixing patterns

Nothing forces consistency. You can have `production`, `staging`, and `dev` for your own service, plus `customer-foo` and `customer-bar` for tenant deployments, all in the same Platz install. The env switcher organises them alphabetically; pick names that sort well.

## Caveats

- **Env names are not unique constraints on the helm release name.** Two envs can be called the same thing. The URL uses the env's UUID, not its name, so the names are pure display. Don't rely on env names for programmatic identification.
- **A cluster can only be attached to one env.** If you need a single cluster to host deployments from two envs, you currently can't — split the cluster into two namespaces and use two clusters? Doesn't work either, because clusters in Platz are identified by their provider ID (the EKS ARN or local context), not by a namespace.
- **Env permissions don't propagate up the cluster level.** A user with env-level admin on env A can only manage deployments on clusters attached to env A. They can't change the cluster's ingress settings, register new clusters, or anything else cluster-scoped — that's a site admin's job.
