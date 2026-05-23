---
sidebar_position: 1
---

# Authentication

Platz delegates user authentication to an external **OpenID Connect** provider. There is no built-in user store, no password reset flow, no MFA management — those concerns belong to your IdP (Auth0, Keycloak, Okta, Dex, Google Workspace via an OIDC bridge, GitHub via an OIDC bridge, etc.). Platz only deals with what happens *after* the IdP says "yes, this is so-and-so".

This page covers how OIDC is configured, what happens on first login, how admin promotion works, and the two flavours of machine-to-machine tokens (user tokens vs bot tokens).

## OIDC configuration

Platz reads four OIDC settings, all required:

| Setting | Source | What it is |
| --- | --- | --- |
| `OIDC_SERVER_URL` | `oidc-config` secret, key `serverUrl` | The OIDC issuer URL. Platz appends `/.well-known/openid-configuration` to fetch the provider's metadata. |
| `OIDC_CLIENT_ID` | `oidc-config` secret, key `clientId` | The OAuth 2.0 client identifier for Platz in your IdP. |
| `OIDC_CLIENT_SECRET` | `oidc-config` secret, key `clientSecret` | The OAuth 2.0 client secret. |
| `PLATZ_OWN_URL` | Helm value `ownUrlOverride`, or derived from `ingress.rules[0].host` | The base URL Platz advertises to itself. Used to construct the OIDC redirect URI and the URLs Platz hands to deployments. |

The first three live in a Kubernetes Secret (default name `oidc-config`) referenced by the chart via `valueFrom.secretKeyRef`. This keeps them out of your values.yaml. See [Installing with Helm](/docs/guide/install/helm) for the create-the-secret commands.

### Redirect URI

Configure your IdP to allow this redirect URI:

```
https://<PLATZ_OWN_URL>/auth/google/callback
```

The `/google/` segment is historical — it's the same path regardless of which IdP you're using. Don't try to rename it; the route is hard-coded in the frontend.

### Required scopes

Platz requests `openid profile email` from the IdP. Make sure your client is configured to return all three. The `email` claim is what links the OIDC identity to a Platz user record; `profile` provides the display name.

### Token lifetime

After a successful OIDC login, Platz issues its own JWT (signed with a server-side secret) that the browser stores. That JWT is valid for **7 days**. After that, the user is bounced back to the IdP for a fresh login. Platz does not silently refresh OIDC tokens.

If your IdP enforces shorter session lifetimes you have two options: keep your IdP's session as the source of truth (users will be redirected back through the IdP every 7 days, where your IdP can enforce its own session policy), or modify the backend to honor `exp` on the IdP-issued token (not currently supported out of the box).

## What happens on first login

The very first time a user clicks "Login" in Platz:

1. The browser is sent to the IdP's authorization endpoint.
2. The user signs in there (potentially through your IdP's MFA, etc.).
3. The IdP redirects back to `/auth/google/callback` with an authorization code.
4. Platz exchanges the code for a token, fetches the user's `email` and `name` claims, and looks them up in the `users` table.
5. If a user with that email **doesn't exist**, Platz creates one. The new user's `is_active` flag is set based on the `ADMIN_EMAILS` environment variable (see below).
6. If a user with that email **does exist**, Platz reuses it. The `name` is updated if the IdP's value has changed.
7. Platz issues its own session JWT, drops a cookie, and redirects to the main page.

### Admin promotion via `ADMIN_EMAILS`

The `auth.adminEmails` chart value becomes the `ADMIN_EMAILS` env var (a space-delimited string) on the `platz-api` container. When a user logs in for the first time, their email is checked against that list:

- **Match** → the user is created with `is_admin=true` and `is_active=true`. They go straight to the admin area.
- **No match** → the user is created with `is_admin=false` and `is_active=false`. They see an "Inactive user" splash and can't do anything until a site admin activates them.

This rule applies **at signup time only**. Removing an email from `ADMIN_EMAILS` after the user already exists does *not* demote them. To revoke admin, edit the user from `/admin/users` (the "Change Global Role" action).

### Auto-add to envs

If an env has `auto_add_new_users: true`, every newly-created user is automatically added to that env with the env-level `User` role. This is how you onboard a whole team without manually granting permissions — flip the flag on your "default" env and any new user immediately sees your deployments after login.

`auto_add_new_users` is **off by default** for safety. New users land in an active-but-no-permissions state otherwise.

## Activating and deactivating users

From `/admin/users` (visible only to site admins):

- **Activate** an inactive user — they can now log in and use whatever env permissions they have.
- **Deactivate** an active user — their session is invalidated immediately. Even if their JWT hasn't expired, the next API request is rejected because Platz re-checks `is_active` on every request.
- **Change Global Role** — toggles the site-wide `is_admin` flag.

Deactivation is the right tool for revoking access when someone leaves the team. You don't delete the user record — deactivation preserves the audit trail (you can still see which tasks they triggered historically) while preventing future access.

## Machine authentication

For CI pipelines, chart back-ends, and other automation, Platz issues bearer tokens. Two flavours, used through the same API but with different scoping:

### User tokens

Personal API tokens tied to your user account. They inherit your permissions exactly: anywhere you'd have access to in the UI, the token has the same access through the API.

Create one from `/profile/user-tokens`:

1. Click **Create User Token**, give it a name (free-form text — you'll forget which token does what otherwise).
2. Platz shows the token **once**. Copy it now. It's not retrievable later.
3. Use it with the `x-platz-token` header:

   ```http
   GET /api/v2/deployments
   x-platz-token: <token>
   ```

Revoke at any time from the same page — revocation is immediate. There's no audit trail of token usage out of the box, so a leaked token can do anything you can until you notice and revoke it. Treat them as you would your own password.

### Bot tokens

Bot tokens belong to a **bot account**, which is a first-class entity in Platz, not tied to any person. Use them for any automation that:

- Should outlive any particular person at the company.
- Needs permissions different from any individual's permissions (e.g. broader env access, narrower deployment access).
- Belongs to a service identity rather than a human.

Bot management lives under `/admin/bots`:

1. Create a bot, give it a name.
2. Issue an API token for it. Same copy-once flow as user tokens.
3. Grant env permissions to the bot just like you would a user.

Bots authenticate exactly like users (same `x-platz-token` header). The API distinguishes the two only when checking permissions and recording audit info.

See [Bots](/docs/guide/admin/bots) for the full workflow including env permission assignment.

## Browser sessions vs API tokens

| | Browser session | User token | Bot token |
| --- | --- | --- | --- |
| Auth header | Cookie (set by `/auth/google/callback`) | `x-platz-token` | `x-platz-token` |
| Validity | 7 days from OIDC login | Until revoked | Until revoked |
| Scope | All of user's permissions | All of user's permissions | The bot's env permissions |
| Tied to a human? | Yes | Yes | No |
| Visible to API consumers as | `acting_user_id` | `acting_user_id` | `acting_bot_id` |

Audit log entries (`deployment_tasks.acting_user_id` / `acting_bot_id` / `acting_deployment_id`) make it possible to distinguish "Alice manually upgraded this" from "the CI bot upgraded this" from "the parent deployment triggered a child deployment via Invoke Action".

## Troubleshooting OIDC

**"Inactive user" page after first login.**
You're not in `auth.adminEmails` and no admin has activated you. Either add your email to `adminEmails` and re-deploy the chart (forces re-creation of the user only if you delete the user row first — easier to ask a current admin to activate you), or set `auto_add_new_users: true` on the env you want them in (see [Envs](/docs/guide/envs/clusters)).

**OIDC callback returns 4xx.**
Most often: the redirect URI configured in your IdP doesn't match `https://<PLATZ_OWN_URL>/auth/google/callback` exactly. Check scheme (http vs https), trailing slash, and path.

**API requests with `x-platz-token` return 401.**
The token is wrong, revoked, or the user/bot is inactive. Try the same token in `curl` against `/api/v2/users/me` — that endpoint will give a clearer error message than most.

**JWT works in browser but not in API client.**
The browser sends the session as a cookie. API clients should use a user token or bot token via `x-platz-token`, *not* the cookie value. The two formats are different.
