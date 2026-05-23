---
sidebar_position: 6
---

# Helm Registries

A **Helm registry** in Platz is an OCI registry repository that holds Helm charts. The `platz-chart-discovery` worker watches these registries and surfaces new chart versions in the UI as soon as they're pushed.

Site admins see registries at `/admin/helm-registries`. Registries are not created by hand — they appear automatically the first time chart-discovery sees a chart in a given (registry, repository) pair.

This page covers how registries are discovered, the two provider modes (`ecr` and `oci`), the relationship between registries and [deployment kinds](#deployment-kinds), and how to debug "my chart isn't appearing" problems.

## How registries appear

Registries are auto-created. The flow:

1. A developer runs `helm push ./my-chart oci://<registry>/<repo>` (or pushes a tagged image in an `ecr push` style for ECR).
2. `platz-chart-discovery` sees a new chart artifact — either via an SQS event (ECR mode) or via a registry catalog poll (OCI mode).
3. If a `helm_registries` row for `(<registry>, <repo>)` doesn't exist, chart-discovery creates one.
4. The chart itself is inserted into `helm_charts` with a foreign key to the registry.

The auto-creation means you don't manage a list of registries in Platz; you manage them through whatever produces the charts (ECR, GHCR, your internal OCI registry).

## Provider modes

Each `chartDiscovery.instances[]` entry in your Helm values has a `provider` field. Two modes are supported.

### `ecr`

Event-driven. Requires an SQS queue fed by EventBridge from ECR push and delete events. The `terraform-aws-platzio` module sets this up automatically; if you're doing it by hand, follow the [Terraform integration](/docs/guide/install/terraform) page for the resource graph.

```yaml
chartDiscovery:
  instances:
    - name: prod-ecr
      provider: ecr
      ecrEvents:
        queueName: platz-chart-events
        regionName: us-east-1
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/platz-chart-discovery
```

ECR mode is **not** a polling mode. Charts that exist in ECR before the queue was created won't appear. To backfill, re-push the chart from your local machine — chart-discovery will see the resulting EventBridge event and ingest it.

For chart deletions, ECR fires a `Image action - DELETE` event. Platz processes it by marking the corresponding `helm_charts` row as `available: false`. Existing deployments referencing the chart keep working (the chart is still in their `helm_charts` row by ID), but the chart disappears from the version picker for new deployments.

### `oci`

Polling-based. Works against any OCI Distribution Spec-compliant registry — Docker Distribution (`registry:2`), zot, GHCR, Harbor, JFrog Artifactory's OCI endpoint, etc.

```yaml
chartDiscovery:
  instances:
    - name: ghcr-mirror
      provider: oci
      oci:
        registryUrl: https://ghcr.io
        pollInterval: 30s
```

The worker hits the registry's `/v2/_catalog` endpoint to list repositories, then for each repository `/v2/<repo>/tags/list` to enumerate tags. For each tag, it does a `GET <repo>:manifest` and filters to artifacts whose config media type is `application/vnd.cncf.helm.config.v1+json` — i.e., the standard Helm-via-OCI media type. Non-Helm OCI artifacts in the same registry are ignored.

`pollInterval` accepts any humantime duration (`5s`, `1m`, `30s`). Defaults to 5 seconds. **Note:** every poll hits every repository's tag list, so high-frequency polling against a registry with thousands of repos generates significant request volume. 30 seconds to a minute is a reasonable production setting.

Authentication: the worker reads anonymously. If your registry requires auth for `_catalog` or pulls, you'll need to either run a sidecar proxy that injects credentials or use an authenticated mirror behind it. Native authenticated pull is on the roadmap.

## The registry detail page

`/admin/helm-registries/<id>` shows:

- **Registry info** — domain, repo name, kind, provider (Ecr/Oci), creation time.
- **Set Icon** action — assigns a FontAwesome icon to display in the deployment list. Stored in `fa_icon` on the registry row, which propagates to the linked deployment kind for UI display. Use `cube` if you don't have an opinion.
- **Helm charts** — a paginated list of every chart version Platz has ever seen for this registry. Each row shows the image tag, creation time, and "BROKEN" / "DELETED" badges when applicable.

## Deployment kinds

Every `helm_registries` row has a `kind_id` foreign key pointing at a row in `k8s_deployment_kinds`. The kind is what users actually pick when creating a deployment — the registry is invisible to end-users; the kind isn't.

Deployment kinds are auto-created the first time a registry is created, named after the repo. So pushing a chart to `my-org/payments-api` produces:

- A registry row: `(<account>.dkr.ecr.us-east-1.amazonaws.com, payments-api)` (ECR) or `(https://ghcr.io, my-org/payments-api)` (OCI).
- A deployment kind row: `payments-api`.

You can rename the kind from the kind's detail page. You can also re-point a registry to a different kind (e.g., when you mirror the same chart to two registries and want both feeding the same kind). Both operations are site-admin only.

## Multiple registries for one kind

Useful when you have:

- A production registry and a staging registry that ship the same chart.
- An ECR-based registry that's being migrated to a generic OCI registry.
- Per-region mirrors for latency-sensitive deployments.

To wire them together: create the second registry by pushing a chart to it, then on the registry's detail page change its `kind_id` to the same kind as the first registry. From then on, the deployment version picker shows charts from both registries with a small label indicating which one.

## Tag formats

When `chart-discovery` is started with `--enable-tag-parser`, it tries to extract structured information from each chart's image tag using regex patterns defined in the `helm_tag_formats` table. The patterns can capture:

- `version` (e.g., `1.2.3`)
- `revision` (e.g., a build number)
- `branch` (e.g., `main`)
- `commit` (e.g., a git SHA prefix)

Each named capture group from a matching pattern gets stored on the chart's `parsed_*` columns, surfaced in the UI as "v1.2.3 (branch=main, commit=abc1234)". This is purely cosmetic — Platz doesn't behave differently based on parsed tag info — but it's useful for distinguishing "production tag" from "PR build tag" at a glance.

Tag formats are managed at `/admin/tag-formats`. Patterns are Perl-compatible regex (the chart-discovery worker uses Rust's `regex` crate, which has the same syntax). Adding a new format reprocesses existing charts; you'll see their parsed fields populate within a few seconds.

If a chart's tag matches multiple patterns, only the first pattern (by creation order) is applied.

## Caveats

- **Chart-discovery is the only writer of `helm_registries`.** Don't create rows by hand; do it by pushing a chart.
- **`available: false` charts can still be installed.** A chart marked as deleted is filtered out of the version picker by default, but the API doesn't refuse a request for it — existing automations referencing a deleted chart's ID keep working. To fully prevent installs of a chart version, delete its row from `helm_charts` (and accept that this breaks audit trail).
- **Two registries can have the same `(domain, repo)` for different installs.** Within a single Platz install, the pair is unique; if you stand up two Platz installs against the same registry, each will track it independently.
- **The OCI poller is stateful only in memory.** Restarting the chart-discovery pod causes a full catalog re-scan; this is fine but generates a burst of registry requests. For very large registries (thousands of repos), the first scan after a restart can take minutes.
- **A chart's `available` flag is per-chart-version, not per-registry.** Marking a chart unavailable doesn't disable its registry; it disables that specific image tag.
