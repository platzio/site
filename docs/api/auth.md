---
sidebar_position: 2
---

# Authentication

Every API request must be authenticated. The API accepts two credential styles, and the
identity behind them can be a **user**, a **bot**, or a **deployment** (see
[Permissions](/docs/api/permissions) for what each can do).

## `x-platz-token` — API tokens

User tokens and bot tokens are sent in the `x-platz-token` header:

```http
GET /api/v2/deployments HTTP/1.1
Host: platz.example.com
x-platz-token: <token>
```

A token looks like `<token-id>.<secret>` — two URL-safe base64 strings joined by a dot.
The server stores only a SHA-256 hash of the secret, which is why the full token is shown
exactly once when it's created (from `/profile/user-tokens` for user tokens, or from a
bot's detail page for bot tokens). Tokens don't expire; they work until revoked.

## `Authorization: Bearer` — access tokens (JWTs)

Session JWTs are sent as a standard bearer token:

```http
GET /api/v2/deployments HTTP/1.1
Host: platz.example.com
Authorization: Bearer <jwt>
```

You normally don't create these yourself — they're issued by Platz:

- **Browser sessions** get a JWT after OIDC login (valid 7 days). The browser holds it
  and the frontend sends it with API calls.
- **Deployments** get a short-lived JWT in the `platz-creds` secret that Platz maintains
  in each deployment's namespace (1-hour lifetime, refreshed every 20 minutes). This is
  how a chart's pods call back into Platz as themselves. See
  [Credentials](/docs/guide/deployments/credentials).

For scripts and CI, prefer an API token via `x-platz-token` — bearer JWTs expire.

## Checking a credential

`GET /api/v2/auth/me` returns the identity behind the credential you presented — the
user, bot, or deployment. It's the quickest way to verify a token works and to see who
the API thinks you are:

```bash
curl -H "x-platz-token: $TOKEN" https://platz.example.com/api/v2/auth/me
```

Failed authentication returns `401`; authenticated requests without sufficient
permissions return a permission error instead — see [Permissions](/docs/api/permissions).

## Notes

- Deactivating a user invalidates their tokens and sessions on the next request — the
  API re-checks `is_active` every time.
- There's no per-request audit of token usage; treat tokens like passwords and revoke
  them when in doubt. See [Authentication](/docs/guide/admin/auth) in the guide for the
  full account model.
