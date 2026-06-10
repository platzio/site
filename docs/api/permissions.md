---
sidebar_position: 4
---

# Permissions

API calls are authorized against the same model the UI uses. This page describes the
model from the API's perspective; the guide's
[Permissions](/docs/guide/envs/permissions) page covers how to assign roles.

## Identities

Every authenticated request acts as one of three identity types (see
[Authentication](/docs/api/auth)):

| Identity       | Credential                             | Typical caller                       |
| -------------- | -------------------------------------- | ------------------------------------ |
| **User**       | Browser session JWT or a user token    | People, personal scripts             |
| **Bot**        | Bot token                              | CI pipelines, external automation    |
| **Deployment** | The `platz-creds` JWT in its namespace | A chart's own pods calling back home |

## The permission layers

1. **Site admin** — the `is_admin` flag on a user. Site admins pass every check. Admin
   checks resolve through the user record, so only _user_ identities can ever be site
   admins — a bot or deployment credential always fails site-admin-only endpoints
   (creating envs, managing users and bots, cluster administration, etc.).
2. **Env-level roles** — rows in `env-user-permissions` assign a user `Admin` or `User`
   on an env. Env admins manage everything inside that env; the check falls back to site
   admin if no env role matches.
3. **Deployment-kind-level roles** — rows in `deployment-permissions` assign a user
   `Owner` or `Maintainer` for one deployment kind inside one env. Owner-gated operations
   require `Owner` exactly; maintainer-gated operations accept any kind-level role (or
   env admin, or site admin).

A deployment's env is derived from its cluster: the cluster's `env_id` decides which
env's roles apply. Operations on deployments whose cluster is not attached to any env are
rejected for non-admins.

## What each identity passes

- **Users** — exactly what their site/env/kind roles allow, same as the UI.
- **Deployments** — a deployment identity is accepted by maintainer-level checks for
  clusters inside its own env. This is what lets a chart's back-end manage child
  deployments next to itself without a human credential.
- **Bots** — ⚠️ bots currently **bypass** the kind-level check: any valid bot token
  passes maintainer-gated operations (the per-bot permission model is not implemented
  yet). Bots still fail site-admin and env-admin checks, since those require a user.
  Treat bot tokens as powerful credentials — see [Bots](/docs/guide/admin/bots).

## Errors

Authentication failures return `401`. A valid credential without sufficient permissions
gets a permission error on the specific operation — the request is rejected, nothing is
partially applied.
