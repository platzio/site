---
sidebar_position: 5
---

# Deployment Credentials

When Platz installs a chart, it needs to give the chart's pods a way to authenticate back to Platz — both for the [Status feature](/docs/guide/deployments/status) (where the chart's pod serves a status endpoint that Platz polls) and for the [Invoke Action](/docs/guide/chart-ext/actions) feature (where Platz's pods call back into the chart's HTTP endpoints).

The credentials mechanism is what makes this two-way communication trust-anchored.

## What gets injected

Platz constructs a per-deployment JWT signed with its own JWT secret and injects it into the chart's helm values. The JWT carries:

- `sub` — the deployment's UUID.
- `env_id` — the env the deployment belongs to.
- `cluster_id` — the cluster the deployment is on.
- `exp` — expiration, currently 1 hour from issuance.

The JWT is renewed on every helm install/upgrade, so it's only ever "fresh as of the last task". For deployments that need a continuously valid token (because Platz's poller calls in with the latest token, but the deployment also makes outbound calls to Platz), the deployment should refresh its outbound credentials periodically.

The token is placed in the helm values as `platz.deployment.access_token` (the exact path may vary by chart-ext version; check your chart's templates for the receiving end).

## Where the chart's templates put it

Typically, a chart's templates wire the token into the deployment's environment:

```yaml
# in the chart's deployment.yaml
env:
  - name: PLATZ_TOKEN
    value: {{ .Values.platz.deployment.access_token | quote }}
  - name: PLATZ_API_URL
    value: {{ .Values.platz.api_url | quote }}
  - name: PLATZ_DEPLOYMENT_ID
    value: {{ .Values.platz.deployment.id | quote }}
```

The pod then reads `PLATZ_TOKEN` from its environment and uses it for outbound calls to Platz, or verifies it on inbound calls from Platz's status poller / action invoker.

## Verifying the token in the chart's pod

For Rust pods, the `platz-sdk` crate (in `platzio/sdk-rs`) provides ready-to-use middleware:

```rust
use platz_sdk::auth::PlatzJwtMiddleware;

let app = axum::Router::new()
    .route("/api/v1/platz-status", get(status_handler))
    .layer(PlatzJwtMiddleware::new());
```

For non-Rust pods, the JWT signing algorithm is HS256 with the shared secret. Verify it against the same JWT secret the Platz API uses (read from the database's `settings` table, or from a Kubernetes secret if you've configured it that way).

A token that fails verification should produce a `401 Unauthorized` response — Platz's poller will treat that as a status fetch failure and surface it accordingly.

## Outbound calls (chart → Platz)

If the chart's pod needs to call back to Platz (e.g., to fetch the value of a referenced secret, or to invoke an action on a sibling deployment), it uses the same JWT in the `x-platz-token` header against Platz's API:

```bash
curl -H "x-platz-token: $PLATZ_TOKEN" \
     https://platz.example.com/api/v2/deployments/$DEPLOYMENT_ID
```

The token is scoped to the deployment's env and to deployment-level operations. It can:

- Read its own deployment row.
- Read other deployments in the same env (for cross-deployment status checks).
- Invoke actions on sibling deployments in the same env (subject to the action's `allowed_role`).
- Read env-level secrets the chart's `values-ui.yaml` references.

It **cannot**:

- Access other envs.
- Change deployment configuration (no creates, no updates).
- Manage users, clusters, or other site-level concerns.

Effectively, deployment credentials are a tightly-scoped service identity that only makes sense as part of the deployment's own lifecycle.

## Disabling deployment credentials

For local development setups (the platzio/dev Tilt configuration in particular), injecting JWTs into every deployment is more friction than it's worth. The `PLATZ_DISABLE_DEPLOYMENT_CREDENTIALS=true` environment variable on the k8s-agent disables the injection:

```yaml
k8sAgent:
  instances:
    - name: default
      extraEnv:
        - name: PLATZ_DISABLE_DEPLOYMENT_CREDENTIALS
          value: "true"
```

When disabled, charts that try to use the Status feature or call back to Platz won't have a token to use. This is fine for local development where you're not exercising those features.

In production, leave the variable unset (default: enabled).

## When the token expires

Currently 1 hour. After expiration, the chart's pod can't make new authenticated calls to Platz, and Platz's status poller stops trusting calls from the pod (though Platz's poller is the *caller* there, so what matters is the token Platz includes in its request, not the one the pod has).

In practice this means:

- A long-running chart pod that holds onto its token for hours will see outbound Platz calls start to fail after the hour is up.
- Each `helm upgrade` re-injects a fresh token, so a deployment that's been touched recently has a valid token.

If your chart needs persistent outbound Platz calls, build refresh logic into it: periodically read the secret-mounted token from disk and re-read it after `helm upgrade` updates it. (Restart-on-config-change makes this much simpler — the pod restarts on every upgrade, picks up the fresh token, and won't be around long enough to hit the expiration.)

## What about user credentials for the chart's UI?

This page covers the *deployment's* credentials — the bot-like identity Platz gives the chart's pods. The chart can also serve its own UI to human users, and that's a totally separate authentication concern: typically the chart hands off to the same OIDC provider Platz uses, with its own client ID.

If you want the chart's UI to know which Platz user is talking to it, the chart's UI can call Platz's `/api/v2/users/me` with the user's session token — but that requires forwarding the session, which is non-trivial. Most charts just use their own auth and accept that the chart's UI and Platz's UI are two separate sessions.

## Caveats

- **The 1-hour expiration is a deliberate trade-off.** Short tokens limit blast radius if leaked, but they require deployment pods to handle refresh. The current expiry is hard-coded; not a chart-level setting.
- **Tokens are HS256, not RS256.** A shared secret, not asymmetric crypto. Charts that verify the token need the same secret Platz uses — which they get via the same secret-injection path. Don't try to verify in a sidecar that doesn't have the secret.
- **No revocation.** A leaked deployment token works for an hour even if you find the leak immediately. Treat tokens as expirable secrets, not as long-lived credentials.
- **The token is in the helm values blob in the database.** If your Postgres backups are compromised, all deployment tokens issued within the last hour are exposed. This is one more reason to keep backups encrypted (the `backup-config` secret's `encryptionKey`).
- **Reinjection isn't automatic when a token expires.** Platz doesn't trigger a `helm upgrade` just to rotate a token. If you want fresh tokens hourly, you'd need an external job to enqueue a Reinstall — which is rarely worth it.
