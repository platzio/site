---
sidebar_position: 5
---

# Bots

A **bot** in Platz is a service identity — a non-human account meant for automation. CI pipelines, GitOps controllers, chart back-ends that invoke Platz actions, anything that needs to authenticate against the API without using a person's credentials.

This page covers what bots are, when to use them instead of a user token, and how to issue and revoke their tokens.

## Why bots and not user tokens?

User tokens (see [Authentication](/docs/guide/admin/auth)) work fine for personal automation. Where they fall down:

- **Tied to a person.** When that person leaves, their tokens get revoked en masse. Your CI pipeline silently breaks.
- **Permissions inherited from a human.** That human might be a maintainer on three envs they shouldn't be touching from CI.
- **Audit trail says "Alice did this"** even when really it was the deploy bot acting on Alice's behalf.

Bots help with the first point cleanly — a bot is a durable service identity that outlives any individual employee, so rotating people doesn't break your automation.

Be aware of two **current limitations** before you lean on bots (both are tracked backend limitations, not by-design behavior):

- **Bots are not permission-scoped.** Bots can't be granted env- or deployment-level roles, and the deployment-maintainer authorization check currently lets any valid bot token through. A bot token is effectively unrestricted — treat it as a powerful credential.
- **Bot actions aren't separately attributed in the audit trail.** There is no `acting_bot_id` column; a task triggered by a bot records neither `acting_user_id` nor `acting_deployment_id`. If you need "who did this" in the History tab, a user token attributes the action to a person, whereas a bot does not.

## Creating a bot

Bots are managed at `/admin/bots` (site admins only).

1. Click **New Bot**.
2. Give it a descriptive name. Bots are user-visible in the audit log — `ci-deploy-prod` is a useful name, `bot-123` is not.
3. Save.

You now have a bot with no tokens and no permissions. It can't do anything yet.

## Issuing an API token

From the bot's detail page (`/admin/bots/<id>`):

1. Open **Actions** → **New API Token**.
2. Platz shows the token **once**. Copy it now into your CI secret store, vault, etc. You will not be able to see it again.
3. The token's row appears in the list below, showing only its ID and creation time.

Use the token with the `x-platz-token` HTTP header:

```http
GET /api/v2/deployments
x-platz-token: <token>
```

A bot can have any number of active tokens. Multiple tokens are useful when you're rotating — issue a new one, deploy it to your CI, then revoke the old one once the deploy succeeds.

## Permissions and scope

A bot does not get env- or deployment-level roles the way a user does — the env
`user-roles` and `deployment-permissions` settings only accept users. As of today a bot
token is **not permission-scoped at all**: once authenticated it passes the
deployment-maintainer check (the per-bot permission model is a known backend limitation,
marked `// TODO: Add bot permissions` in the source). In practice that means **any bot
token can act as a maintainer across deployments**, so you can't lean on Platz RBAC to
contain a bot.

Until per-bot permissions land, contain blast radius outside of Platz:

- **Prefer per-deployment credentials for chart back-ends.** A chart whose back-end calls
  Platz already gets a short-lived, automatically-scoped token in its namespace
  (`platz-creds`, an `Identity::Deployment` token). Use that instead of handing the chart a
  bot token — it's scoped to that one deployment and rotates on its own. See
  [Credentials](/docs/guide/deployments/credentials).
- **Limit what the token can reach.** Network policy, registry scoping, and CI secret
  isolation are your real guardrails for a bot.
- **Issue and rotate sparingly.** Keep the number of live bot tokens small and rotate them.

The full (user-facing) RBAC model is in [Permissions](/docs/guide/envs/permissions).

## Revoking access

Two levels:

- **Revoke a single token.** From the bot's detail page, find the token row and click the **Revoke** action. The token stops working immediately, but the bot itself stays around with any other tokens still functional.
- **Delete the bot.** From the bot's detail page, **Actions** → **Delete Bot**. This removes all of the bot's tokens at once, so every token it ever issued stops working.

## Conventions for bot accounts

A few rules of thumb that scale well:

- **One bot per system, not one bot per token.** Your CI has one identity, even if you rotate its token weekly.
- **Remember a bot token isn't permission-scoped.** Because Platz doesn't yet restrict a bot to specific envs or deployment kinds, don't assume a "prod-deploy bot" can only touch prod — any valid bot token can act as a maintainer. Limit reach with network/registry scoping instead.
- **Prefer per-deployment credentials for service back-ends.** If a chart's back-end calls Platz to invoke actions, use the deployment's own `platz-creds` token (see [Credentials](/docs/guide/deployments/credentials)) rather than a bot — it's automatically scoped to that one deployment.
- **Don't share bot tokens across teams.** A leaked or over-shared token is hard to trace because bot actions aren't attributed to a person in the audit columns.
- **Rotate tokens periodically.** Even with no observed compromise, rotation limits blast radius if a token leaks via a CI log, screenshot, or git history.

## User-acted vs deployment-acted (and where bots fit)

Every `deployment_task` records who triggered it via two nullable columns:

| Column                 | Set when                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `acting_user_id`       | A human (using either a browser session or a personal user token) triggered the task.                                |
| `acting_deployment_id` | A deployment triggered the task on another deployment (e.g. an `InvokeAction` from a chart's `actions-schema.yaml`). |

There is **no `acting_bot_id` column.** A task triggered by a bot token leaves both
columns null, so it isn't attributed to a specific bot (or to anything) in the History
tab. This is the main reason to prefer a user token when you care about a per-actor audit
trail, and to prefer per-deployment `platz-creds` for chart back-ends (those _do_ populate
`acting_deployment_id`). Filter by `acting_deployment_id` to trace cross-deployment side
effects.

## Pitfalls

- **A bot has no email and no OIDC identity.** Don't try to log into the UI as a bot — there's no flow for it. The bot exists solely to authenticate API calls.
- **The first token is shown only once.** No "show again" link, no recovery flow. If you lose it before saving it, revoke it and issue another.
- **Tokens never expire on their own.** Set a calendar reminder if you want regular rotation.
- **Deleting a bot is irreversible.** The bot's ID is permanently retired so the audit log keeps making sense. There's no "undelete bot" action.
