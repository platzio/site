---
sidebar_position: 5
---

# Actions

`platz/actions.yaml` defines custom operations that show up in a deployment's **Actions** menu. Each action describes an HTTP request Platz will make to the deployment's standard ingress when the user invokes it — typically for chart-specific operations like "rotate keys", "force re-index", "drain queue", "run migrations".

Actions are the chart author's way of exposing chart-specific lifecycle commands through the Platz UI, with proper RBAC and audit trail, without needing custom backend integration.

## File structure

The file is a list of `Action` resources (Kubernetes-style headers).

```yaml
- apiVersion: platz.io/v1beta1
  kind: Action
  spec:
    id: rotate-keys
    title: Rotate Keys
    description: Rotate the encryption keys used by this service. Existing sessions are invalidated.
    fontawesome_icon: key
    allowed_role: Owner
    allowed_on_statuses: [Running]
    dangerous: true
    endpoint: standard_ingress
    path: /api/v1/admin/rotate-keys
    method: POST

- apiVersion: platz.io/v1beta1
  kind: Action
  spec:
    id: reindex
    title: Rebuild Search Index
    description: Drops the search index and rebuilds from scratch. Search is unavailable until the rebuild finishes.
    fontawesome_icon: magnifying-glass
    allowed_role: Maintainer
    allowed_on_statuses: [Running, Pending]
    method: POST
    endpoint: standard_ingress
    path: /api/v1/admin/reindex
    ui_schema:
      inputs:
        - id: force
          type: Checkbox
          label: Force rebuild even if a previous rebuild is still running
          initialValue: false
      outputs:
        values:
          - path: [force]
            value:
              FieldValue:
                input: force
```

Each action is its own resource. Add as many as you want.

## Spec fields

| Field                 | Type             | Required           | Notes                                                                                 |
| --------------------- | ---------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `id`                  | string           | Yes                | Stable identifier. Used in API calls and audit logs. Don't change after release.      |
| `title`               | string           | Yes                | Display label in the Actions menu.                                                    |
| `description`         | string           | Yes                | Shown in the confirmation modal. Explain what the action does.                        |
| `fontawesome_icon`    | string           | No                 | Icon shown next to the title. FontAwesome class name without `fa-` prefix.            |
| `allowed_role`        | enum             | Yes                | Minimum role to invoke. `Owner` or `Maintainer`.                                      |
| `allowed_on_statuses` | array of strings | No                 | Statuses where the action is selectable. If omitted, the action is always selectable. |
| `dangerous`           | boolean          | No (default false) | If `true`, the confirmation modal uses a red "Yes, I'm sure" button.                  |
| `endpoint`            | enum             | Yes                | Where the HTTP request goes. Currently only `standard_ingress` is supported.          |
| `path`                | string           | Yes                | The HTTP path appended to the deployment's standard ingress hostname.                 |
| `method`              | enum             | Yes                | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.                                 |
| `ui_schema`           | object           | No                 | A mini values-ui schema for collecting inputs before invocation.                      |

## How invocation works

When a user clicks an action in the menu:

1. The frontend opens a confirmation modal. If `ui_schema` is set, the modal also includes the input fields.
2. The user confirms. If the action is `dangerous`, the confirm button is red.
3. The frontend posts to Platz's API, which enqueues an `InvokeAction` task.
4. The k8s-agent picks up the task, constructs the HTTP request:
   - URL = `https://<deployment-standard-ingress-host><path>`.
   - Method = the configured method.
   - Headers = `Authorization: Bearer <platz-deployment-jwt>` and `Content-Type: application/json`.
   - Body (for non-GET methods) = JSON-encoded outputs from the action's `ui_schema`, or `{}` if no `ui_schema`.
5. The deployment's pod handles the request and returns a response.
6. The k8s-agent records the response body and status as the task's `reason` in the History tab.

If the HTTP request returns a non-2xx status, the task is marked `Failed` and the response body is captured in `reason`. If the connection fails (the deployment's pod is down, network error), same — task fails.

## `allowed_role`

The minimum deployment-level role required to invoke. Two options:

- `Owner` — the strictest. Only deployment owners (and env admins, site admins) can invoke. Use for actions that fundamentally change behaviour (key rotation, data destruction, infrastructure modifications).
- `Maintainer` — looser. Anyone with maintainer (or owner) can invoke. Use for operational actions on-call might want (reindex, cache flush, force-refresh).

`User` role can't invoke any actions, no matter what. There's no "anyone can invoke" mode.

For bots: a bot with `Maintainer` on the deployment kind can invoke `Maintainer`-required actions. A bot with no deployment-level role can't invoke anything (env admin bypasses this, as always).

## `allowed_on_statuses`

A list of status values where the action is selectable. Useful for actions that only make sense in certain states.

```yaml
allowed_on_statuses: [Running]
```

The action only appears in the menu when the deployment is in `Running` state. When the deployment is `Failed`, `Installing`, `Disabled`, etc., the action is hidden.

If `allowed_on_statuses` is omitted, the action is always selectable regardless of status.

Common patterns:

- `[Running]` — for normal-operation actions.
- `[Failed]` — for recovery actions (re-run migration after a failed upgrade).
- `[Running, Pending]` — for actions that can run while a task is in-flight too.

## `ui_schema` (action inputs)

If the action needs parameters, declare them in `ui_schema`. The structure is a slimmed-down [values-ui schema](/docs/guide/chart-ext/inputs) — same input types, same outputs section, but scoped to this one action's confirmation modal.

```yaml
ui_schema:
  inputs:
    - id: drain_timeout_seconds
      type: number
      label: Drain Timeout (seconds)
      required: true
      initialValue: 30
      minimum: 1
      maximum: 600
    - id: confirm_text
      type: text
      label: Type "DRAIN" to confirm
      required: true
  outputs:
    values:
      - path: [drain_timeout_seconds]
        value:
          FieldValue:
            input: drain_timeout_seconds
```

The user fills in the form in the modal, hits Confirm, and the resolved outputs become the JSON body of the HTTP request.

For actions that don't need parameters, omit `ui_schema` entirely. The request body will be `{}`.

## Implementing the endpoint in your chart

The HTTP endpoint is just an endpoint on your chart's standard ingress — any framework that can route HTTP works. A minimal Rust example using the `platz-sdk` crate:

```rust
use platz_sdk::auth::PlatzJwtMiddleware;
use serde::Deserialize;
use axum::{Router, routing::post};

#[derive(Deserialize)]
struct RotateKeysBody { /* matches the ui_schema outputs, if any */ }

async fn rotate_keys_handler(
    /* authenticated by PlatzJwtMiddleware */
    body: axum::Json<RotateKeysBody>,
) -> Result<&'static str, axum::http::StatusCode> {
    // ... do the work ...
    Ok("rotated 3 keys")
}

let app = Router::new()
    .route("/api/v1/admin/rotate-keys", post(rotate_keys_handler))
    .layer(PlatzJwtMiddleware::new());
```

For non-Rust pods: the request includes an `Authorization: Bearer <jwt>` header signed with the Platz JWT secret. Verify it like you would any HS256 JWT. The `sub` claim contains the deployment's UUID; the `env_id` and `cluster_id` claims are populated too.

Return whatever response makes sense — a short success message, a structured JSON object, or an error. The whole response body ends up in the task's `reason`.

## Audit trail

Every invocation produces a `deployment_tasks` row with:

- `operation` = `{InvokeAction: {action_id, body}}` — both the action's id and the resolved body are persisted.
- `acting_user_id` / `acting_bot_id` / `acting_deployment_id` — who invoked it.
- `reason` = the response body.
- `status` = `Done` on 2xx, `Failed` on non-2xx or connection error.

Surfaced in the History tab. If you need a "show me every time anyone has rotated keys" view, filter the History tab by action ID (or query the database directly).

## Cross-deployment action invocation

Actions can also be invoked from one deployment to another. The flow:

1. Deployment A's pod uses its [deployment credentials](/docs/guide/deployments/credentials) to call Platz's API, requesting that an action be invoked on deployment B.
2. Platz authorizes the call: both deployments must be in the same env, and A must have at least `Maintainer` on B's kind (currently bots and deployments are granted Maintainer permissions implicitly).
3. Platz enqueues a normal `InvokeAction` task; the audit trail records `acting_deployment_id = A`.

This is how charts can compose — a chart's pod can trigger actions on its dependencies. Used sparingly, it's a clean way to orchestrate cross-service operations.

## Caveats

- **Action endpoints are only reachable through standard ingress.** No private endpoint variant. If your standard ingress is public-internet-facing, anyone with the right JWT (i.e., Platz, or anyone who breaches the JWT secret) can call your action endpoint.
- **Action `id` is immutable in practice.** Changing it across a chart upgrade orphans existing audit log entries that reference the old ID. The History tab will still show them, but the action itself will be gone from the menu.
- **`allowed_role: User` doesn't exist.** Users with the env-level `User` role and no deployment-level role can't invoke actions, period.
- **The HTTP timeout is generous but not infinite.** Currently around 10 minutes. Long-running actions should kick off a background job and return immediately, then surface progress via the Status feature.
- **No streaming responses.** The response body is captured in full before the task completes. For multi-megabyte responses, the History tab gets unwieldy. Keep responses small.
- **No idempotency keys.** A user who double-clicks the action button enqueues two tasks. Your endpoint should be idempotent or include its own dedupe.
- **Action invocation isn't allowed against a deployment that's in flight (Installing/Upgrading).** The task queue serializes per deployment, so an InvokeAction during an active Upgrade would wait — which is rarely what you want. If the action is `allowed_on_statuses: [Running]`, you sidestep this naturally.
