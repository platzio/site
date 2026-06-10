---
sidebar_position: 3
---

# Pagination

Every list endpoint is paginated. Pagination is controlled with two query parameters:

| Parameter   | Meaning                             | Notes                       |
| ----------- | ----------------------------------- | --------------------------- |
| `page`      | 1-based page number.                | Defaults to the first page. |
| `page_size` | Number of items to return per page. | Server-capped.              |

The response is an envelope around the items:

```json
{
  "page": 1,
  "per_page": 50,
  "num_total": 123,
  "items": [{ "...": "..." }]
}
```

- `page` — the page you got, matching what you asked for.
- `per_page` — the effective page size the server used.
- `num_total` — the total number of items matching the query, across all pages.
- `items` — the resources on this page.

To iterate, keep requesting `page = 2, 3, …` until `page × per_page >= num_total`:

```bash
curl -H "x-platz-token: $TOKEN" \
  "https://platz.example.com/api/v2/deployments?page=2&page_size=20"
```

Filter parameters (e.g. `kind_id`, `cluster_id` on deployments) combine with pagination —
`num_total` always reflects the filtered count. The SDKs handle page-walking for you: the
[Rust SDK](/docs/api/sdks/rust)'s `paginated()` helper fetches all pages and returns a
flat `Vec`, and the generated [Python client](/docs/api/sdks/python) exposes the same
`page` / `page_size` parameters per endpoint.
