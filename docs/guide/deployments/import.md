---
sidebar_position: 3
---

# Importing Existing Deployments

If you've been running Helm releases by hand or through CI scripts, and want Platz to take them over, there's a manual import path. Platz doesn't have a one-click "import" button — but the steps are simple enough.

This page walks through the process, the constraints, and what to do when import isn't viable.

## What Platz needs

For a deployment to be Platz-managed, it must:

1. **Live in its own namespace**, named whatever you want, with the label `platz: "yes"` and the annotation `platz_deployment_id: <some-uuid>` (matching a row in the `deployments` table).
2. **Be installable from a chart in a registered Helm registry.** Platz can only `helm upgrade` charts it knows about. If the original install used a chart from a registry not connected to Platz, you'll need to add the registry first.
3. **Have a corresponding row** in the `deployments` table linking to the right cluster, kind, helm_chart, config, and (optionally) values_override.

The cleanest way to set this up is:

1. **Push the chart to a Platz-connected registry** (see [Helm Registries](/docs/guide/admin/helm-registries)).
2. **Create a new deployment** through the Platz UI with the same config as the existing release. Platz installs into a _fresh_ namespace, not your existing one.
3. **Migrate stateful data** from the old namespace to the new one (database dump/restore, persistent volume snapshot, etc.).
4. **Cut traffic over** to the new deployment.
5. **`helm uninstall` the original release** and delete the old namespace.

This is the path most teams take. It's slower than a true import but has no rough edges — by the end, the deployment is unambiguously Platz-owned.

## True in-place import

If you can't tolerate the namespace migration (long-running stateful services with terabytes of data, or services with external integrations pinned to the namespace name), you can stitch an existing release into Platz manually:

1. **Add the `platz=yes` label and `platz_deployment_id` annotation** to the existing namespace. The k8s-agent's tracker will start watching it.
2. **Insert a row in `deployments`** with the right kind, cluster, helm_chart, config, and values_override matching the actual installed chart. The `id` must match the annotation you just added.
3. **Insert a synthetic `deployment_tasks` row** describing the Install operation, status `Done`, so the History tab has a starting point.

This requires database write access (which env admins don't have — only operators with direct Postgres access). The procedure is:

```sql
-- 1. Insert the deployment row
INSERT INTO deployments (
    id, name, kind_id, cluster_id, helm_chart_id,
    enabled, config, values_override, status, revision_id,
    created_at
) VALUES (
    '<your-uuid>',
    '<deployment-name>',
    '<kind-id>',
    '<cluster-id>',
    '<helm-chart-id>',
    true,
    '<config-json>'::jsonb,
    NULL,
    'Running',
    '<task-uuid>',
    NOW()
);

-- 2. Insert a synthetic Install task
INSERT INTO deployment_tasks (
    id, created_at, execute_at, started_at, finished_at,
    cluster_id, deployment_id,
    operation, status, reason
) VALUES (
    '<task-uuid>',
    NOW(),
    NOW(),
    NOW(),
    NOW(),
    '<cluster-id>',
    '<your-uuid>',
    '{"Install": {"helm_chart_id": "<helm-chart-id>", "config_inputs": {}, "values_override": null}}'::jsonb,
    'Done',
    'Synthetic import'
);

-- 3. Annotate the namespace from kubectl
-- kubectl label namespace <ns> platz=yes
-- kubectl annotate namespace <ns> platz_deployment_id=<your-uuid>
```

After this, the deployment shows up in the UI. The next time someone hits **Edit Deployment** and saves, the resulting `helm upgrade` runs against the real namespace and either gracefully picks it up (if the chart's templates idempotently match the existing resources) or fails with a "cannot patch" error (if Helm sees resources it doesn't know about).

**This is brittle.** Don't do it unless you have to.

## What about the Helm release itself?

Platz uses Helm 3, which stores release state in Kubernetes Secrets (not Tiller). When Platz "imports" a deployment via the synthetic-row approach above, it doesn't re-install — but the existing Helm release secret needs to be findable by Helm when the next `helm upgrade` runs.

The Helm release name is usually `<chart-name>` (no namespace prefix, no random suffix). Platz follows the same convention by default. If your existing release has an unconventional name, you'll need to either rename the Helm release secret to match Platz's expectation, or fork the chart's templates to set `nameOverride` appropriately.

## When you can't import

A few cases that don't have clean import paths:

- **The existing release uses a chart that's not in a Platz-connected registry.** Solution: push the chart to a connected registry first.
- **The existing release was installed with a different chart version than any currently in your registry.** Solution: re-push the exact chart version, then import.
- **The existing release uses Helm 2.** Migrate to Helm 3 first (Helm has a documented `helm-2to3` migration plugin).
- **The existing release uses Helm hooks that Platz doesn't expect.** Hooks for backups, etc. work fine. Hooks that depend on specific naming conventions (post-install jobs that reference fixed pod names) may collide.
- **The existing release isn't using OCI charts.** Platz only supports OCI registries. Re-push your chart through `helm push`.

For these cases, the migration-via-new-deployment route (steps 1-5 at the top of this page) is the only realistic option.

## Verifying an imported deployment

After importing, sanity-check:

1. **The deployment appears in the UI** with the right name, kind, and cluster.
2. **The Resources tab populates** within a couple of minutes — the k8s-agent's tracker needs to do a full reconcile after the namespace label is added.
3. **The Overview tab shows the correct chart version and config.**
4. **`helm list -n <namespace>`** still shows the original release (Platz didn't touch the Helm-internal state).
5. **A no-op edit** (Edit Deployment, change nothing, save) successfully triggers an Upgrade task that succeeds. If it fails with helm errors, your synthetic row didn't match the real release closely enough — debug from the helm pod's stderr.

If step 5 fails, the deployment is in a "shown but not really managed" state. Either fix the discrepancy or fall back to the migration approach.

## Caveats

- **Importing is a manual SQL operation.** There's no Platz API endpoint for it. If you find yourself importing often, build internal tooling around the SQL.
- **The audit log starts at import time.** Pre-import history (who installed what when) is lost from Platz's perspective. The Helm release secret still has its install timestamp and chart version, but it's not surfaced in the Platz UI.
- **A typo in the synthetic config blob causes confusion.** The UI shows what's in the database; if the database doesn't match reality, the form will look wrong. Take the time to extract the actual values from the running release (`helm get values <release> -n <namespace> --all`) and put them into the imported row.
- **No automated import.** Tools that import dozens of legacy releases at once are something you build yourself; Platz doesn't ship one.
