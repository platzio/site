---
sidebar_position: 7
---

# Status

The **Status feature** lets a chart's pods report a structured health document back to Platz, which renders it in the deployment's UI — a color-coded badge, optional warning notices, optional numeric metrics, and an optional "primary metric" shown directly in the deployment list.

The feature is opt-in: charts that don't enable it still get tracked at the resource level (see [Tracking](/docs/guide/deployments/tracking)), but the UI shows a generic "Running" status without any richer detail.

This page covers how the feature works at runtime, what the status document looks like, and how to wire it up in a chart.

## How the polling works

`platz-status-updates` is a worker that subscribes to deployment changes and runs a polling loop per enabled deployment. For each deployment:

1. Construct the URL from the deployment's [Standard Ingress](/docs/guide/chart-ext/features#standard-ingress) hostname plus the chart's configured status path. e.g., `https://<deployment-hostname>/api/v1/platz-status`.
2. HTTP GET that URL with a 10-second timeout.
3. Parse the JSON response into the expected status struct.
4. Write the result into `deployments.reported_status`.
5. Sleep for the chart's configured `refresh_interval_secs` (default 15s) and repeat.

The status data is broadcast over the WebSocket so the UI updates without needing a refresh.

If the HTTP request fails (timeout, non-2xx response, JSON parse failure), the previous status is retained for a few cycles before being cleared. Repeated failures over a few minutes flip the status to `Unknown`.

## Enabling the feature

In the chart's `platz/features.yaml`:

```yaml
apiVersion: platz.io/v1beta1
kind: Features
spec:
  status:
    endpoint: standard_ingress
    path: /api/v1/platz-status
    refresh_interval_secs: 15
```

Three fields:

- `endpoint` — currently only `standard_ingress` is supported. The status URL is constructed by appending `path` to the deployment's standard ingress hostname.
- `path` — the HTTP path to GET. Anything; pick something that doesn't clash with your application routes.
- `refresh_interval_secs` — how often to poll. Default 15 seconds. Lower for high-signal services, higher for low-traffic ones.

The Status feature requires the Standard Ingress feature to also be enabled (because that's where the hostname comes from). If your chart has `ingress.enabled: false`, Status is a no-op.

## The status document

The chart's pod returns a JSON document conforming to this shape (defined in the `platz-sdk` crate; if you use Rust, import the type and serialize it; if you use another language, hand-roll JSON matching this):

```json
{
  "color": "green",
  "text": "Running normally",
  "primary_metric": {
    "label": "Active users",
    "value": "1,247"
  },
  "metrics": [
    {
      "label": "Queue depth",
      "value": "0"
    },
    {
      "label": "Last sync",
      "value": "30 seconds ago"
    }
  ],
  "notices": [
    {
      "level": "warning",
      "text": "Approaching rate limit (87% of quota used)"
    },
    {
      "level": "info",
      "text": "Scheduled maintenance on 2026-04-01"
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `color` | `"red"` / `"yellow"` / `"green"` | Sets the badge color in the deployment list. |
| `text` | string | Free-form text rendered next to the badge. Keep short. |
| `primary_metric` | optional `{label, value}` | Rendered in the deployment list row, right-aligned. Use for the one number that summarizes the service ("Active users", "Queue depth", "Error rate"). |
| `metrics` | optional array of `{label, value}` | Rendered in the metrics grid on the Overview tab. |
| `notices` | optional array of `{level, text}` | Rendered as banners on the Overview tab. `level` is `info`, `warning`, or `danger`. |

All fields except `color` and `text` are optional. A minimal response is `{"color": "green", "text": "OK"}`.

## What "color" means

The semantics are advisory; Platz doesn't enforce a meaning, but the conventions are:

- `green` — the service is doing what it should.
- `yellow` — degraded but functional. Maybe a dependency is slow, maybe you're approaching a quota. The service is up.
- `red` — broken. Users are affected. Page someone.

Use `red` sparingly and intentionally — it triggers attention in the UI and shouldn't fire for transient issues.

## Where the data shows up

- **Deployment list row**: the `color` drives the badge color, `text` shows next to it, `primary_metric` shows right-aligned.
- **Overview tab metrics grid**: every entry in `metrics` renders as a labelled value.
- **Overview tab notices**: every entry in `notices` renders as a banner colored by its `level`.

The polling interval determines refresh latency end-to-end. With `refresh_interval_secs: 15`, the UI shows a status change within ~15 seconds of the chart's pod reporting it (plus a small WebSocket broadcast delay).

## Implementing the endpoint

You're returning a JSON document over HTTP. Anything that can serve HTTP works. A few practical notes:

- **Don't expose secrets in the response.** The endpoint is reachable from anyone who can reach the deployment's ingress. Treat the response as semi-public — it's fine to expose "queue depth: 47" but not "API key: xyz".
- **Authenticate if you care.** Platz issues a short-lived JWT (1 hour) and includes it in the polling request's `Authorization: Bearer ...` header. Your endpoint can verify the JWT against the same JWT secret Platz uses if you want to ensure only Platz can query.
- **Be fast.** The poll timeout is 10 seconds. If your status endpoint takes 8 seconds to compute, the entire polling loop is your bottleneck.
- **Be idempotent and side-effect-free.** It runs every 15 seconds, forever. Don't increment counters or write to logs on every request.
- **Handle restarts gracefully.** Just after a pod restart, you might have nothing useful to report. Return `{"color": "yellow", "text": "starting up"}` rather than failing the request — failures result in `Unknown` status, which is less informative.

## Cross-deployment status

If your chart needs to surface "I depend on chart X being healthy, and X is not", you can:

1. Have your chart's pod query Platz's own API (via a Bot token) to fetch the dependency's reported status.
2. Roll up the result into your own status.

The dependency's `reported_status` is a regular field on the `deployments` API. See the API reference for the exact endpoint.

## Caveats

- **One status per deployment.** Charts that have multiple components (a backend, a worker, a job) need to consolidate them into a single endpoint. There's no "status per pod" surfacing.
- **The status endpoint is polled regardless of whether anyone's looking.** This is fine for cheap status computations but wasteful for expensive ones. If computing your status costs measurable money or compute, return cached results and update the cache on a slower schedule than the poll.
- **No historical status.** Platz only knows the *current* status. If you want graphs of status-over-time, push the metrics to your time-series database from the same place that serves the status endpoint.
- **No alerting.** Platz doesn't page anyone based on the status. Wire status changes into your alerting via Grafana on the underlying metrics.
- **The status endpoint isn't required to be public-internet reachable.** It needs to be reachable from the `platz-status-updates` pod. In-cluster ingress is fine; private DNS is fine. Public ingress is overkill (and risky).
