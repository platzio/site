---
sidebar_position: 1
---

# Endpoints

All API endpoints are served under the `/api/v2` prefix of your Platz installation, e.g.
`https://platz.example.com/api/v2/deployments`. Requests and responses are JSON.

Every endpoint requires authentication — see [Authentication](/docs/api/auth). List
endpoints are paginated — see [Pagination](/docs/api/pagination) — and most accept
resource-specific filters as query parameters.

## Resources

| Resource                            | Methods                                  | Notes                                                                                       |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/api/v2/auth/me`                   | `GET`                                    | Returns the calling identity — a user, bot, or deployment. Useful for testing tokens.       |
| `/api/v2/users`                     | `GET`, `PUT {id}`                        | Users are created by OIDC login, never via the API. `PUT` updates flags such as `is_admin`. |
| `/api/v2/user-tokens`               | `GET`, `POST`, `DELETE {id}`             | Personal API tokens. The token value is returned once, on creation.                         |
| `/api/v2/bots`                      | `GET`, `POST`, `PUT {id}`, `DELETE {id}` | Bot accounts. See [Bots](/docs/guide/admin/bots).                                           |
| `/api/v2/bot-tokens`                | `GET`, `POST`, `DELETE {id}`             | API tokens belonging to bots. Same copy-once semantics as user tokens.                      |
| `/api/v2/envs`                      | `GET`, `POST`, `PUT {id}`, `DELETE {id}` | Environments.                                                                               |
| `/api/v2/env-user-permissions`      | `GET`, `POST`, `DELETE {id}`             | Env-level role assignments (`Admin` / `User`).                                              |
| `/api/v2/deployment-permissions`    | `GET`, `POST`, `DELETE {id}`             | Deployment-kind-level role assignments (`Owner` / `Maintainer`).                            |
| `/api/v2/k8s-clusters`              | `GET`, `PUT {id}`, `DELETE {id}`         | Clusters are discovered by the k8s-agent; `PUT` sets env assignment, ingress, etc.          |
| `/api/v2/deployments`               | `GET`, `POST`, `PUT {id}`, `DELETE {id}` | The main resource. `POST` creates an Install task; `PUT` creates an Upgrade task.           |
| `/api/v2/deployment-tasks`          | `GET`, `POST`, `DELETE {id}`             | The task queue / audit trail per deployment.                                                |
| `/api/v2/deployment-kinds`          | `GET`, `PUT {id}`                        | Kinds are auto-created from registries; `PUT` renames.                                      |
| `/api/v2/deployment-resources`      | `GET`, `POST`, `PUT {id}`, `DELETE {id}` | Custom resources owned by chart extensions.                                                 |
| `/api/v2/deployment-resource-types` | `GET`                                    | Resource type definitions, read-only via the API.                                           |
| `/api/v2/helm-registries`           | `GET`, `PUT {id}`                        | Registries are auto-created by chart-discovery; `PUT` re-points the kind or sets the icon.  |
| `/api/v2/helm-charts`               | `GET`                                    | Chart versions ingested by chart-discovery, read-only.                                      |
| `/api/v2/helm-tag-formats`          | `GET`, `POST`, `DELETE {id}`             | Regex patterns for the chart tag parser.                                                    |
| `/api/v2/k8s-resources`             | `GET`                                    | Tracked Kubernetes resources, read-only.                                                    |
| `/api/v2/secrets`                   | `GET`, `POST`, `PUT {id}`, `DELETE {id}` | Env-level secrets.                                                                          |
| `/api/v2/ws`                        | WebSocket                                | Pushes database change events to clients; this is what keeps the UI live.                   |

Single-item reads are `GET <resource>/{id}` with the resource's UUID.

## OpenAPI schema

The backend generates a complete OpenAPI schema covering every route and type — it's the
authoritative reference, and it's what the [Python](/docs/api/sdks/python) and
[Rust](/docs/api/sdks/rust) SDKs are generated from. To produce it, run the API binary
with the `openapi` subcommand:

```bash
platz-api openapi schema       # YAML
platz-api openapi schema json  # JSON
```

For example, against a running install:

```bash
kubectl -n platzio exec deploy/platz-platzio-api -- /root/platz-api openapi schema
```
