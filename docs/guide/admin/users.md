---
sidebar_position: 4
---

# Users

User management in Platz happens in two places, by design:

- **Site admins** — managed at `/admin/users`. This is where you control who counts as a Platz user at all, and which of them have the site-wide admin flag.
- **Env permissions** — managed at `/envs/<env>/settings/user-roles`. This is where you control who can see and do things in a specific env. See [Permissions](/docs/guide/envs/permissions).

This page covers the first part: the global view of all users.

## Where users come from

Platz doesn't have a "Create User" button. Users are created automatically the first time someone logs in via OIDC — see [Authentication](/docs/guide/admin/auth) for the full flow. A new user record is created with these fields populated from the IdP:

- `email` — used for identity matching, must be unique.
- `name` — display name, can change between logins if the IdP updates it.
- `is_admin` — set to `true` if the user's email matches `ADMIN_EMAILS`, `false` otherwise.
- `is_active` — set to `true` if the user is an admin (above), `false` otherwise.

In other words: only admins are auto-activated. Non-admins need a manual touch from an existing admin before they can do anything.

## The Users page

`/admin/users` (site admins only) shows two sections:

### Active users

Listed alphabetically by display name. Each row shows the avatar, name, email, and a badge if the user is a site admin. Per-user actions:

- **Change Global Role** — toggles the `is_admin` flag. Promote a regular user to site admin, or demote yourself if you've decided someone else should be in charge. There's no separate "remove me as admin" safeguard, so be deliberate.
- **Deactivate** — flips `is_active` to false. The user's session is invalidated immediately; their next API request returns 401. Their record stays in the database and their historical actions are preserved in the audit log.

### Deactivated users

Listed separately, near the bottom of the page. Each row has a single action:

- **Activate** — flips `is_active` back to true. The user can now log in again. Their env permissions are preserved from before they were deactivated.

There's no "delete user" action. Deactivation is the only way to revoke access — and the right way, because deletion would break the audit log's foreign keys.

## Site admins vs env admins

The two are deliberately separate concerns:

| | Site admin | Env admin |
| --- | --- | --- |
| Flag on | `users.is_admin` (boolean) | Row in `env_user_permissions` with role `Admin` |
| Granted by | Another site admin (or `ADMIN_EMAILS` at first login) | An env admin or a site admin |
| Can manage users | Yes (activate/deactivate, change global role) | Only env-level (add/remove users from this env) |
| Can manage clusters | Yes | No (can attach existing clusters to their env via env settings, but can't register new ones) |
| Can manage bots | Yes (all bots) | No |
| Can see all envs | Yes | No (only envs they're granted access to) |
| Can edit env config | Yes | Yes, but only on their envs |

A site admin can do anything an env admin can do, in any env. The reverse is not true.

## Onboarding a new team member

The typical flow:

1. They log in to Platz for the first time using their company SSO. They land on the "Inactive user" page.
2. A site admin opens `/admin/users`, finds them in the Deactivated section, clicks **Activate**.
3. An env admin (or the same site admin) opens `/envs/<env>/settings/user-roles`, clicks **Add User Permission**, and grants them the `User` role on the relevant env.
4. They refresh the Platz tab — the env now appears in their env switcher.

If you do this often, set `auto_add_new_users: true` on the env you usually want new people in. They'll get `User` role on that env automatically at signup, skipping step 3.

## Offboarding

When someone leaves:

1. Their IdP account is disabled (your security team's job). This prevents *new* OIDC logins from succeeding.
2. A site admin deactivates their Platz user at `/admin/users`. This invalidates any browser session and any user tokens they have.

The IdP disable alone isn't enough — Platz's session JWT is independent of the IdP token, so a deactivated user with a valid Platz JWT could keep using the system for up to 7 days. Always deactivate the Platz user too.

User tokens belonging to a deactivated user **stop working immediately** — Platz re-checks `is_active` on every API request. You don't need to revoke each token individually.

## Caveats

- **Email is the linkage key.** If a user's email changes at the IdP, Platz will create a brand new user record on next login (and the old one will sit unused). To preserve audit continuity, update the email column on the existing user record directly in the database before they next log in, or have them not change emails.
- **Display names are advisory.** The `name` column updates from the IdP claim on every login. Don't rely on it for stable identification — use `id` (UUID) or `email`.
- **There's no soft-delete or hard-delete.** Deactivation is permanent in the sense that it's the only state below "active". To "remove" a user, deactivate them and never re-activate them.
- **Two users with the same email shouldn't exist.** The schema enforces this. If you have a SAML→OIDC migration in flight and need to swap a user's email, do it in a single transaction.
