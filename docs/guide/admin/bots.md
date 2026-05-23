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

Bots fix all three:

- They outlive any individual employee.
- Their env permissions are independent of any user's permissions.
- The audit log distinguishes `acting_user_id` from `acting_bot_id`, so "deployed by ci-deploy-bot" reads clearly in the History tab.

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

## Granting permissions

A freshly created bot can authenticate but can't see any envs. To give it access, go to the env settings (not the bot page) and grant it permissions there:

1. `/envs/<env>/settings/user-roles` → **Add User Permission**.
2. The picker shows both users and bots. Pick the bot.
3. Choose a role: `Admin` (full env access including modifying env settings) or `User` (can deploy and invoke actions according to deployment-level permissions).

For deployment-level permissions (e.g. only the bot can deploy a specific kind), use `/envs/<env>/settings/deployment-permissions` and assign the bot `Owner` or `Maintainer` on the relevant deployment kinds.

The full RBAC model is in [Permissions](/docs/guide/envs/permissions).

## Revoking access

Two levels:

- **Revoke a single token.** From the bot's detail page, find the token row and click the **Revoke** action. The token stops working immediately, but the bot itself stays around with any other tokens still functional.
- **Delete the bot.** From the bot's detail page, **Actions** → **Delete Bot**. This removes all of the bot's tokens at once and removes the bot from any env it was granted access to. The audit log entries that reference the bot stay intact (foreign keys use nullable bot IDs).

## Conventions for bot accounts

A few rules of thumb that scale well:

- **One bot per system, not one bot per token.** Your CI has one identity, even if you rotate its token weekly.
- **Scope down to the env that needs it.** Give the prod-deploy bot access only to the prod env. Give the staging-deploy bot access only to staging.
- **Use deployment-level permissions for service back-ends.** If a chart's back-end calls Platz to invoke actions, give the chart's bot `Maintainer` on its own deployment kind (and nothing else). It can act on its own deployments but can't touch anyone else's.
- **Don't share bot tokens across teams.** When team A shares a token with team B, every action that team B takes shows up in the audit log as team A's bot. You lose the audit trail.
- **Rotate tokens periodically.** Even with no observed compromise, rotation limits blast radius if a token leaks via a CI log, screenshot, or git history.

## Bot-acted vs user-acted vs deployment-acted

Every `deployment_task` records who triggered it via one of three nullable columns:

| Column                 | Set when                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `acting_user_id`       | A human (using either a browser session or a personal user token) triggered the task.                                |
| `acting_bot_id`        | A bot's token was used.                                                                                              |
| `acting_deployment_id` | A deployment triggered the task on another deployment (e.g. an `InvokeAction` from a chart's `actions-schema.yaml`). |

The History tab in the UI surfaces all three. Filter by `acting_bot_id` when you want to audit a specific bot's activity, or by `acting_deployment_id` when you want to trace cross-deployment side effects.

## Pitfalls

- **A bot has no email and no OIDC identity.** Don't try to log into the UI as a bot — there's no flow for it. The bot exists solely to authenticate API calls.
- **The first token is shown only once.** No "show again" link, no recovery flow. If you lose it before saving it, revoke it and issue another.
- **Tokens never expire on their own.** Set a calendar reminder if you want regular rotation.
- **Deleting a bot is irreversible.** The bot's ID is permanently retired so the audit log keeps making sense. There's no "undelete bot" action.
