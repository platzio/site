---
sidebar_position: 2
---

# Permissions

Platz's RBAC has three layers that compose:

1. **Site admin** (`users.is_admin`) — global override, can do anything in any env.
2. **Env-level role** (`env_user_permissions`) — controls who has access to a specific env at all, and who can manage that env's settings.
3. **Deployment-level role** (`deployment_permissions`) — within an env, controls who can create, modify, and act on specific deployment kinds.

This page walks through each layer in detail and explains how they combine.

## Site admin

The site-admin flag is binary: you either have it or you don't. Site admins:

- See every env, every cluster, every deployment.
- Can manage users at `/admin/users`.
- Can manage clusters at `/admin/clusters`.
- Can manage helm registries at `/admin/helm-registries`.
- Can manage bots at `/admin/bots`.
- Bypass all env-level and deployment-level role checks.

Granted by another site admin via `/admin/users` → **Change Global Role**, or auto-granted at first OIDC login if the user's email is in `ADMIN_EMAILS` (see [Authentication](/docs/guide/admin/auth)).

Most installs have a handful of site admins — typically the team that operates Platz itself. Don't grant it casually; site admin is the keys-to-the-castle role.

## Env-level roles

Managed at `/envs/<env>/settings/user-roles` (env admins and site admins only). Two roles:

### `Admin` (env-level)

Can do everything within an env:

- Modify env settings (node selectors, tolerations, `auto_add_new_users`).
- Manage env-level user roles (add/remove users, change their roles).
- Manage env-level deployment permissions (assign Owner/Maintainer roles).
- Manage env-level secrets.
- Manage env-level resources.
- Install, upgrade, uninstall, and act on any deployment in the env (env admin overrides deployment-level role checks).

Env admins **cannot** touch site-level concerns: they can't register new clusters, change a cluster's ingress settings, manage bots, or activate users globally.

A site admin's view of an env is functionally a superset of an env admin's view.

### `User` (env-level)

The default role for env members. Can:

- See the env in their env switcher.
- View deployments, tasks, resources, and secrets in the env (read-only by default).
- Take actions on deployments **only if** they also have a deployment-level role (Owner or Maintainer) on the relevant kind.

Without any deployment-level roles, a `User` is essentially read-only for that env — useful for stakeholders who need visibility but shouldn't be deploying.

### Granting env permissions

From `/envs/<env>/settings/user-roles`:

1. Click **Add User Permission**.
2. Pick a user or a bot from the picker. The picker shows both — bots appear with a bot icon.
3. Pick `Admin` or `User`.
4. Save.

Granting `Admin` is reversible: change the role back to `User` or remove the user entirely.

Removing the last admin from an env triggers a warning at the top of the env's admin page (`/admin/envs/<id>`). Site admins can recover by adding themselves or another user back.

## Deployment-level roles

Managed at `/envs/<env>/settings/deployment-permissions`. The page is a matrix: rows are deployment kinds, columns are roles. Each cell lists the users/bots with that role for that kind.

### `Owner` (deployment-level)

The "I own this service" role. Can:

- Create new deployments of this kind.
- Edit existing deployments (chart version, config, cluster).
- Edit deployment descriptions.
- Modify `values_override` (the raw YAML escape hatch — owners only).
- Enable / disable deployments.
- Delete deployments.
- Everything a Maintainer can do.

### `Maintainer` (deployment-level)

The "I operate this service" role. Can:

- Edit existing deployments (chart version, config, cluster).
- Restart Kubernetes resources (pods, deployments, statefulsets).
- Invoke custom actions from the chart's `actions-schema.yaml`.
- Clone existing deployments.
- Edit deployment descriptions.

Cannot:

- Create new deployments of this kind.
- See or modify `values_override`.
- Enable/disable or delete deployments.

### Why two levels

Owner is for the team that builds and ships the service. Maintainer is for the on-call rotation that operates it day-to-day. Same humans often, but with different "blast radius" responsibilities: Owners decide _what_ should exist; Maintainers handle _what currently exists_.

For services that don't need this split (a chart your platform team owns end-to-end), grant Owner to everyone on the team and don't bother with Maintainer.

### Granting deployment permissions

From `/envs/<env>/settings/deployment-permissions`:

1. Find the deployment kind row.
2. In the appropriate column (Owner or Maintainer), click **Add User**.
3. Pick a user or bot.
4. Save.

Permissions are additive. A user with both Owner _and_ Maintainer on the same kind effectively has Owner (Maintainer adds nothing new). Permissions on different kinds are independent.

### Auto-grants vs explicit grants

There's no automatic deployment-level grant. Even if you have env-level `Admin` (which bypasses deployment-level checks), the matrix won't show your name in any cell — you just don't appear in the per-kind rosters unless you grant yourself explicitly.

For env admins, the matrix is mostly informational ("here's who can deploy what without going through me"). For env users, it's load-bearing: they can't do anything until granted.

## How roles compose

A user can act on a deployment if, in order of priority:

1. They are a site admin, OR
2. They are an env admin on the deployment's env, OR
3. They have a deployment-level role on the deployment's kind that grants the specific action.

So:

| User                | Env role | Deployment role              | Can upgrade `payments-api`? | Can delete it?               |
| ------------------- | -------- | ---------------------------- | --------------------------- | ---------------------------- |
| Site admin          | (any)    | (any)                        | Yes                         | Yes                          |
| Env admin on `prod` | Admin    | (none)                       | Yes (env admin overrides)   | Yes                          |
| Env user on `prod`  | User     | (none)                       | No (no deployment role)     | No                           |
| Env user on `prod`  | User     | Maintainer on `payments-api` | Yes                         | No (Maintainer can't delete) |
| Env user on `prod`  | User     | Owner on `payments-api`      | Yes                         | Yes                          |

## Bots and permissions

Bots use the same RBAC primitives. Grant them env-level User role and the deployment-level roles they need. A typical CI bot for a single service:

- Env-level: User on `production`.
- Deployment-level: Owner on the service's kind.

It can create, upgrade, and delete its own deployments, but can't touch any other deployment kind. It also can't change env settings.

## Caveats

- **The matrix doesn't have a "global" cell.** You can't grant Owner on _all_ deployment kinds in one click — it's per kind. For env-wide grants, use env-level Admin (which is a superpower; use sparingly).
- **Removing an env user doesn't remove their deployment-level roles.** It just removes their env-level row. They lose visibility into the env (so the deployment rows are unreachable for them anyway), but the deployment*permissions rows persist. Re-adding them re-exposes their old deployment grants. This is intentional for "vacation mode" — remove and re-add without losing fine-grained permissions. But it's a sharp edge: a user removed for cause should be removed \_and* have their deployment grants cleaned up.
- **There's no role inheritance across kinds.** Owner on kind `foo` doesn't grant Owner on kind `bar`. Manage them independently.
- **The first time you grant a permission to a new user, they need to log in once first.** Platz can only grant permissions to users that exist in the database, and users are auto-created on first OIDC login.
