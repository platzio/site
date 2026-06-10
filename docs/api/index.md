---
sidebar_position: 1
---

# Overview

Platz exposes a JSON HTTP API under the `/api/v2` prefix of your installation, e.g.
`https://platz.example.com/api/v2/deployments`.

## Reference

The full endpoint reference is rendered directly from the backend's OpenAPI schema:

👉 **[API Reference](/api)** — every route, parameter, request body, and response schema,
generated from the running API.

The reference is built from the OpenAPI spec published with each
[`platzio/backend`](https://github.com/platzio/backend) release, so it always matches a
released version of the API rather than a hand-maintained list.

## Concepts

The pages in this section cover the cross-cutting concerns the reference doesn't spell out
per endpoint:

- **[Authentication](/docs/api/auth)** — the `x-platz-token` and `Authorization: Bearer`
  credential styles, and `GET /api/v2/auth/me` for checking who a token belongs to.
- **[Pagination](/docs/api/pagination)** — the `page` / `page_size` parameters and the
  `{ page, per_page, num_total, items }` envelope returned by every list endpoint.
- **[Permissions](/docs/api/permissions)** — how user, bot, and deployment identities are
  authorized against the site / env / deployment-kind permission layers.
- **SDKs** — typed clients for [Python](/docs/api/sdks/python) and
  [Rust](/docs/api/sdks/rust), both generated from the same OpenAPI schema.

## Generating the schema yourself

The API binary can emit the OpenAPI document directly, which is handy for pinning a
specific install's schema or feeding your own tooling:

```bash
platz-api openapi schema       # YAML
platz-api openapi schema json  # JSON
```

For example, against a running install:

```bash
kubectl -n platzio exec deploy/platz-platzio-api -- /root/platz-api openapi schema
```
