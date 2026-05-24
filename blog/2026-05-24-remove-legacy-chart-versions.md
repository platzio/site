---
slug: remove-legacy-chart-versions
title: Removing legacy chart versions from the Helm index
tags: [maintenance]
---

If you've been getting `helm repo update` warnings — or if you watch our
ArtifactHub feed — you may have noticed errors about a missing Bitnami
Postgres image:

```
error scanning image docker.io/bitnami/postgresql:14.5.0-debian-11-r35:
image not found (package platzio:0.6.2)
```

We've removed the entries that triggered it.

{/* truncate */}

## What happened

Platz chart versions up to and including `0.6.2` declared a dependency on
the [Bitnami PostgreSQL subchart](https://github.com/bitnami/charts), which
in turn pulled `docker.io/bitnami/postgresql:14.5.0-debian-11-r35`. In late
2025 Bitnami moved their historical image tags to a separate
`bitnamilegacy` namespace and deleted them from `docker.io/bitnami/*`. The
Helm chart still references the old path, so scanners (and anyone trying
a fresh install of an old version) get a 404.

The dependency itself was removed in `v0.6.3`. The reasoning is in the
[v0.6.8 release notes](/blog/v0.6.8) and on the
[Database](/docs/guide/install/database) page: operators get full control
over the database, and Platz isn't in the business of shipping somebody
else's Postgres chart.

## What changed

We removed entries `<= 0.6.2` from the Helm repository
[index](https://platzio.github.io/helm-charts/index.yaml). The repository
now serves `0.6.3` through `0.6.8`. That's enough history to roll back
across the post-Bitnami era; everything older was tied to the broken
dependency anyway.

The release tarballs themselves are untouched — they still live on
[GitHub Releases](https://github.com/platzio/helm-charts/releases). If
you've pinned a specific older version by URL in your own automation, it
will continue to resolve.

## What you should do

- **If you're on `0.6.3` or later:** nothing. You won't see any change.
- **If you're still on `0.6.2` or earlier:** plan an upgrade to the
  latest `0.6.x`. Provision Postgres yourself (RDS, Cloud SQL,
  self-hosted — see the
  [Database](/docs/guide/install/database) page), populate the
  `postgres-creds` secret, and bump the chart. The schema migration runs
  automatically on API pod startup.
- **If you depended on the bundled Bitnami subchart in production:**
  same as above. The bundled subchart was never intended for serious
  production use, and it's now structurally broken; migrating off it is
  the path forward.
