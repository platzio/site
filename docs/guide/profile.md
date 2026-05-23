---
sidebar_position: 6
---

# Your Profile

Your profile page (`/profile/you`) is the per-user settings area. Two main things live here: your basic identity (display name, email, when you joined) and your personal API tokens.

## The Profile page

`/profile/you` shows:

- **Avatar** — pulled from your OIDC provider's profile (Google profile pic, Gravatar, whatever your IdP returns). Not editable in Platz; if you want to change it, change it at your IdP.
- **Display name** — also from your IdP. Updates on each login if your IdP's `name` claim has changed.
- **Email** — your identity within Platz. Not editable; emails are the unique key linking your OIDC identity to your Platz user row. If you need to change your email, see the caveat in [Users](/docs/guide/admin/users#caveats).
- **User ID** — the UUID Platz uses internally. Useful when an admin needs to grant you permission to something (you can copy your ID and send it to them) or when filtering audit logs.
- **Joined** — the timestamp of your first OIDC login.

If you have site-admin rights, you'll also see a small badge or indicator (depending on UI version).

## User Tokens

`/profile/user-tokens` is where you create and manage personal API tokens — bearer tokens that authenticate against the Platz API as you, with all your permissions.

### When to use a user token

User tokens are right when:

- You're writing a personal script or one-off automation that needs to call the Platz API.
- The script should act _as you_ — same env access, same deployment-level permissions.
- The script's lifetime is short, or you're comfortable rotating the token when needed.

User tokens are **not** the right choice for:

- **Production automation.** When you leave the company, your user is deactivated, and your tokens stop working — possibly mid-deploy. Use a [bot](/docs/guide/admin/bots) instead.
- **Shared automation across the team.** "We all use Alice's token" is brittle. Bots scope to the function, not the human.
- **Anything that needs different permissions than you have.** Bots can be granted a different permission set than any individual user.

In short: user tokens are for _your_ tooling, not for the team's.

### Creating a user token

1. From `/profile/user-tokens`, click **Create User Token**.
2. Give it a name. The name is for your own bookkeeping — Platz doesn't enforce uniqueness, and the name shows nowhere except the token list. Pick something specific (`local-dev-kubectl-plugin`, not `token1`).
3. Submit.
4. **Platz shows the token once.** Copy it now. You will not be able to see it again.

The token format is `<base64-id>.<base64-secret>` — two base64-encoded chunks separated by a dot. Don't trim, don't split, don't reformat. Use it verbatim.

### Using a user token

Pass the token in the `x-platz-token` header on API requests:

```bash
curl -H "x-platz-token: $PLATZ_TOKEN" https://platz.example.com/api/v2/deployments
```

You can also drop it into the `PLATZ_TOKEN` environment variable if you're using `platz-cli`, the `platz-sdk-js` or `platz-sdk-rs` client libraries, or any automation that knows to look there.

### Revoking a token

Find the token in the list at `/profile/user-tokens`. Each row shows the token's ID (a UUID), the creation timestamp, and any name you set. Click **Revoke**.

Revocation is immediate. The next request using the token returns 401.

You can have any number of active tokens at once. There's no "max tokens per user" cap.

### What happens if your token is leaked

If you suspect a token has leaked (you accidentally committed it to a git repo, screen-shared it, posted it in a chat):

1. **Revoke it immediately** from `/profile/user-tokens`. This is the only thing that stops the bleeding.
2. **Audit the History tab** of any deployment you can see for unexpected tasks. Filter by your user ID. Anything you didn't do is suspicious.
3. **Notify your security team.** Token leaks are credential incidents; the disclosure process is your org's, not Platz's.

There's no per-token usage audit log out of the box. Platz logs API requests at the API layer (HTTP-level access logs), but doesn't link requests back to specific token rows. If you need fine-grained audit, add logging at the reverse proxy in front of Platz.

## When you can't log in

If you visit Platz and see "Inactive user":

- Your account exists but is inactive. A site admin needs to activate it at `/admin/users`.
- See [Authentication](/docs/guide/admin/auth#what-happens-on-first-login).

If you're redirected back to the IdP and never make it to Platz:

- Your IdP session might be invalid (expired, revoked).
- Platz's session might have expired (7-day JWT lifetime).
- Try logging out at the IdP and back in.

If you see a generic OIDC error:

- Likely a configuration issue (mismatched redirect URI, expired client secret). Talk to the operator who installed Platz.

## Caveats

- **Display name updates on each login.** If you change your name at the IdP, the new name shows up after your next Platz login. Other users see the new name immediately.
- **Profile avatars are pulled at login.** If your IdP serves a different image URL each time, your avatar might appear to flicker. Most IdPs serve a stable URL.
- **The "joined" timestamp doesn't move.** Once you exist in Platz, your `created_at` is fixed even across deactivate/reactivate cycles.
- **Tokens are shown only at creation time.** No "show again" link. If you lose the token, revoke and create another.
- **The token doesn't have a fixed expiry.** A token issued a year ago is still valid unless revoked. Set yourself reminders if you want rotation.
- **Revoking your own user record isn't a feature.** Deactivation is a site-admin operation. If you want to leave the system entirely, ask an admin to deactivate you.
