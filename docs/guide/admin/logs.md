---
sidebar_position: 8
---

# Logs

Platz integrates with Grafana + Loki to give users a one-click "open the logs for this deployment" link. The integration is configured per cluster (so different clusters can point at different Loki instances) and shows up as an **Open Logs** entry in each deployment's Actions menu.

This page covers how the link is constructed, how to set it up, and how to use it with non-Grafana log stacks.

## What the integration does

Platz doesn't ingest, query, or store logs itself. The "Open Logs" action is a single hyperlink that opens Grafana with a pre-filled Loki query for the deployment's namespace. The query looks like:

```
{namespace="<deployment-namespace>"}
```

And the link points at Grafana's explore view for the configured Loki datasource, with that query in the URL hash.

That's it. The full responsibility for log retention, indexing, parsing, alerting, and access control sits with Grafana + Loki. Platz only points at them.

## Configuration

The Grafana URL and Loki datasource name live on each cluster row. Configure from `/admin/clusters/<id>` → **Change Cluster Grafana Configuration**:

| Field           | Example                       | Notes                                                                   |
| --------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Grafana URL     | `https://grafana.example.com` | Base URL. Platz appends `/explore?...` to it. No trailing slash.        |
| Datasource name | `loki-prod-us-east-1`         | The name as it appears in Grafana's Data Sources page — case-sensitive. |

When both fields are populated, the **Open Logs** action appears on every deployment in that cluster. If either is empty, the action is hidden.

The configuration is per-cluster because in multi-cluster setups, each cluster typically ships logs to its own region-local Loki to keep query latency reasonable. You can also point all clusters at one central Grafana if your log pipeline is already centralized.

## Setting up Loki

Out of scope for these docs — see the [Loki documentation](https://grafana.com/docs/loki/latest/). The relevant constraint for Platz: your Loki configuration must label log streams with `namespace=<deployment-namespace>` so Platz's query filter works. This is the default for `promtail`, `grafana-agent`, `fluent-bit`, etc. when scraping pod logs in Kubernetes.

A common setup:

1. Run Loki in the same cluster as the deployments (or in a central log cluster, with `promtail` agents in each app cluster forwarding to it).
2. Install Grafana, configure a Loki datasource named e.g. `loki`.
3. Enter the Grafana URL and `loki` as the datasource name on each Platz cluster row.

## Permissions

The Open Logs link relies on Grafana's own authentication and RBAC — Platz doesn't pass any identity through. Two practical setups:

- **Anonymous Grafana** with read-only Loki access. Easy, but anyone with a Platz session sees production logs. Only acceptable if your logs are not sensitive (e.g., internal staging only).
- **Grafana with OIDC**, ideally the same IdP Platz uses. The link opens, Grafana checks the session, and the user either lands in Explore (if they're logged in) or gets bounced to the IdP first. Per-user Grafana permissions then control what they see.

There's currently no way to restrict the Open Logs action to a subset of Platz users — it appears for everyone with access to the deployment. Combine this with Grafana-side ACLs if you need finer control.

## Using non-Grafana log stacks

Anything that supports URL-encoded queries in the address bar can work, but you'll need to ignore the "datasource name" semantics and treat the Grafana URL as a generic prefix:

| Log stack             | Link format you'd configure                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Grafana + Loki        | `https://grafana.example.com` + datasource name `loki`                                       |
| OpenSearch Dashboards | Currently no native support; you'd need to either fork the frontend or post-process the link |
| Datadog               | Same — not natively supported                                                                |
| CloudWatch Logs       | Same                                                                                         |

The link format is hard-coded in the frontend, so anything other than Grafana + Loki requires a code change today. There's an open question about making the URL format pluggable; until then, Grafana is the path of least resistance.

## What about the API and worker logs?

The Open Logs action only covers **deployment** logs — the pods of charts Platz manages. For Platz's own component logs (the API, the workers), you don't go through this; you use `kubectl logs` directly, or whatever your log pipeline is already doing for the Platz namespace.

A nice side effect of the per-cluster Grafana configuration: if you configure the cluster that hosts Platz itself with a Grafana URL, all of Platz's own deployments (if you ever deploy something through Platz onto Platz's own cluster) get the action automatically.

## Debugging the link

If the **Open Logs** action doesn't appear:

1. Check the cluster row at `/admin/clusters/<id>`. Both Grafana URL and datasource name must be set.
2. Refresh the deployment page — the action menu is computed at render time but cached briefly in the frontend's collection store.

If the link appears but Grafana opens to an error:

1. Verify the datasource name matches exactly — Grafana is case-sensitive, and a typo silently fails.
2. Verify Loki is running and reachable from Grafana's pod.
3. Run the query `{namespace="<deployment-namespace>"}` manually in Grafana Explore to confirm it returns results. If it doesn't, your log pipeline isn't labeling with `namespace=`.

## Caveats

- **The link is a soft integration.** Nothing breaks if Grafana is down or the datasource is wrong — the link just doesn't work. Platz doesn't probe the URL.
- **No log streaming inside Platz.** The frontend has no live tail. If you want one, the [Resources tab](/docs/guide/deployments/tracking) shows pod status, but logs are firmly Grafana's job.
- **The link doesn't include a time range.** Grafana opens with whatever default range it's configured for (usually "last 1 hour"). For investigating a specific deployment task, you'll often need to widen the range manually.
- **Multi-namespace deployments aren't supported.** If a chart somehow creates resources in multiple namespaces, the link only shows logs for the primary namespace. Charts that follow Platz conventions are always single-namespace.
