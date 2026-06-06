---
sidebar_position: 2
---

# Installing with Terraform

The [`terraform-aws-platzio`](https://github.com/platzio/terraform-aws-platzio) module is
the canonical way to provision Platz on AWS. It wires up everything the Helm chart can't
create on its own — the IAM roles (bound to your EKS OIDC provider via IRSA), the SQS
queue and EventBridge rule that ECR push events flow into, and the S3 bucket for database
backups — and then runs the Helm release for you.

If you're not on AWS, skip this page; the [Helm install](/docs/guide/install/helm) is what
you want.

## What the module provisions

The repo is organised into submodules so you can place each piece in the right AWS
account. The tags in this repo track the Helm chart tags, so pin the same `ref` you use
for the chart.

| Submodule         | Resources                                                                                                                 | Use it for                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `main`            | The `platzio` namespace, the `oidc-config` and `postgres-creds` Secrets, and a `helm_release` that installs Platz         | Installing Platz itself into an EKS cluster                       |
| `k8s-agent-role`  | One IAM role per k8s-agent instance, with an IRSA trust policy and `eks:*` / `ec2:DescribeRegions` / ECR-read permissions | Letting a k8s-agent discover and reach EKS clusters in an account |
| `chart-discovery` | SQS queue, EventBridge rule, an EventBridge→SQS IAM role, and an IRSA role with SQS + ECR-read permissions                | The chart-discovery worker's `ecr` provider mode                  |
| `backup`          | S3 bucket and an IRSA role with `s3:PutObject` on it                                                                      | The optional Postgres backup CronJob                              |

`main` is the entry point. The other three produce outputs whose shape matches the lists
`main` expects, so you instantiate them and pass the module objects straight in.

> **Note on the submodule layout.** Earlier versions of these docs referred to `iam`,
> `ecr-events`, `backups`, and `route53` submodules. Those names are out of date — the
> current submodules are `main`, `k8s-agent-role`, `chart-discovery`, and `backup`, and
> there is no Route 53 / DNS submodule (the module does not manage DNS; see below).

## What it doesn't do

- **It doesn't create your EKS cluster.** You bring an existing cluster (`terraform-aws-eks`
  or `eksctl` are both fine). The module attaches Platz to it via the `kubernetes` and
  `helm` providers, looked up by `k8s_cluster_name`.
- **It doesn't manage DNS.** There is no Route 53 submodule. Point your DNS at your ingress
  controller / load balancer yourself (or with `external-dns`).
- **It doesn't create the OIDC provider.** That's your IdP. The module reads the OIDC
  client ID, client secret, and issuer URL from **SSM Parameter Store** (see below).
- **It doesn't create the ECR repositories.** Existing ECR repos are picked up
  automatically by chart-discovery once the SQS queue exists — but the repos themselves are
  your responsibility.

It _can_ optionally create the database for you: by default (`install_database = true`) the
`main` module installs an in-cluster PostgreSQL via the
[groundhog2k/postgres](https://artifacthub.io/packages/helm/groundhog2k/postgres) chart and
generates the password. For production, set `install_database = false` and pass
`database_config` pointing at RDS or Aurora.

## OIDC via SSM parameters

The `main` module does **not** take OIDC credentials inline. Instead you store the three
values in SSM Parameter Store and pass their _names_; the module reads them and creates the
`oidc-config` Kubernetes Secret:

```hcl
oidc_ssm_params = {
  server_url    = "/platz/oidc/server-url"
  client_id     = "/platz/oidc/client-id"
  client_secret = "/platz/oidc/client-secret"
}
```

This keeps the secret out of your Terraform state where possible and lets you rotate it
without a `terraform apply`.

## Typical structure

A minimum-viable single-cluster install wires the helper modules into `main`:

```hcl
# IAM role for ECR chart discovery — created in the account that holds your ECR repos.
module "platz_chart_discovery" {
  source = "github.com/platzio/terraform-aws-platzio//modules/chart-discovery?ref=v0.7.0-beta.4"

  irsa_oidc_provider = local.eks_oidc_provider # oidc.eks.us-east-1.amazonaws.com/id/ABC123
  irsa_oidc_arn      = local.eks_oidc_arn
}

# IAM role the k8s-agent uses to discover and connect to EKS clusters.
module "platz_k8s_agent_role" {
  source = "github.com/platzio/terraform-aws-platzio//modules/k8s-agent-role?ref=v0.7.0-beta.4"

  instance_name      = "default"
  irsa_oidc_provider = local.eks_oidc_provider
  irsa_oidc_arn      = local.eks_oidc_arn
}

module "platz" {
  source = "github.com/platzio/terraform-aws-platzio//modules/main?ref=v0.7.0-beta.4"

  # Which EKS cluster to install into (used to fetch credentials for the helm provider).
  k8s_cluster_name = "prod-us-east-1"

  # Ingress for external access. Omit to skip creating an ingress.
  ingress = {
    host       = "platz.example.com"
    class_name = "nginx"
    tls = {
      secret_name        = "platz-tls"
      create_certificate = true
      create_issuer      = false # reuse an existing ClusterIssuer
      issuer_email       = "ops@example.com"
    }
  }

  # OIDC for user login, read from SSM Parameter Store.
  oidc_ssm_params = {
    server_url    = "/platz/oidc/server-url"
    client_id     = "/platz/oidc/client-id"
    client_secret = "/platz/oidc/client-secret"
  }

  # Initial site admins.
  admin_emails = ["admin@example.com"]

  # Bring your own database (recommended for production).
  install_database = false
  database_config = {
    host     = aws_db_instance.platz.address
    port     = "5432"
    user     = "platz"
    password = var.platz_db_password
    database = "platz"
  }

  # Wire in the helper modules created above.
  chart_discovery = [module.platz_chart_discovery]
  k8s_agents      = [module.platz_k8s_agent_role]

  # Optional: pin the chart version (defaults to the module's current version).
  chart_version = "0.7.0-beta.4"
}
```

`terraform apply`, wait for the ingress controller to publish the route and cert-manager
(or your ALB) to issue a certificate, and Platz is reachable at the host you configured.

## How the ECR integration works

ECR is event-driven in Platz: there is no polling, no scheduled job. The `chart-discovery`
submodule sets up the flow:

1. A developer runs `helm push ./my-chart oci://123.dkr.ecr.us-east-1.amazonaws.com/my-chart`.
2. ECR emits an **ECR Image Action** event (the EventBridge rule matches `source: aws.ecr`,
   `action-type: PUSH`/`DELETE`, `result: SUCCESS`).
3. The EventBridge rule forwards matching events to the module's SQS queue (14-day
   retention, long polling, SSE).
4. The `platz-chart-discovery` pod, running with the IRSA role this module creates (which
   allows `sqs:ReceiveMessage`/`DeleteMessage`/`GetQueueUrl`/`GetQueueAttributes` on the
   queue plus ECR read), picks the event up.
5. It pulls the chart from ECR, extracts it, parses the Chart Extension files, and inserts
   a `helm_charts` row.

Because `DELETE` actions are matched too, charts disappear from Platz automatically when
they're deleted from ECR — they're flagged `available: false` rather than removed outright,
so existing deployments referencing the chart aren't orphaned.

There's no backfill: if you create the SQS queue _after_ charts already exist in ECR, those
charts won't appear in Platz until they're re-pushed.

When your ECR repos span several regions or accounts, instantiate `chart-discovery` once
per account (each with a distinct `instance_name`) and pass them all in the
`chart_discovery` list.

## IAM roles created (IRSA)

Each helper submodule creates an IAM role whose trust policy allows the EKS cluster's OIDC
provider to assume it via `AssumeRoleWithWebIdentity`, pinned to the matching ServiceAccount
(`system:serviceaccount:<namespace>:<release>-<worker>-<instance>`).

| Submodule         | Role permissions                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `k8s-agent-role`  | `ec2:DescribeRegions`, `eks:ListClusters`, `eks:DescribeCluster` on `*`, plus the `AmazonEC2ContainerRegistryReadOnly` managed policy. One role per agent instance. |
| `chart-discovery` | `sqs:ReceiveMessage`/`DeleteMessage`/`GetQueueUrl`/`GetQueueAttributes` on its queue, `sqs:ListQueues` on `*`, plus `AmazonEC2ContainerRegistryReadOnly`.           |
| `backup`          | `s3:PutObject` (and related) on the backup bucket.                                                                                                                  |

The `resource-sync` and `status-updates` workers need no AWS permissions, so no IAM roles
are created for them. The chart wires each role ARN onto the relevant pod's ServiceAccount
via `eks.amazonaws.com/role-arn` annotations.

Note that discovering an EKS cluster (an IAM concern) is separate from being able to deploy
into it (a Kubernetes RBAC concern). The k8s-agent connects to each discovered cluster's API
server as its IAM identity using `aws eks get-token`, so that identity must also be mapped in
the target cluster's RBAC — see [Clusters](/docs/guide/admin/clusters).

## Cross-account EKS

When Platz runs in one account but manages clusters in others, the trust is **not** a chained
`sts:AssumeRole`. Each k8s-agent pod federates directly into a role in the tenant account
using IRSA / web-identity. To make that work, you replicate the control cluster's OIDC
provider into the tenant account and create a `k8s-agent-role` there that trusts it:

```hcl
# In the TENANT account only:

resource "aws_iam_openid_connect_provider" "platz_control_cluster" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [var.control_cluster_irsa_thumbprint]
  url             = var.control_cluster_irsa_issuer_url
}

module "platz_k8s_agent_role" {
  source = "github.com/platzio/terraform-aws-platzio//modules/k8s-agent-role?ref=v0.7.0-beta.4"

  # Must be unique across all agent instances — it names the StatefulSet/ServiceAccount.
  instance_name = "tenant-prod"

  irsa_oidc_provider = replace(aws_iam_openid_connect_provider.platz_control_cluster.url, "https://", "")
  irsa_oidc_arn      = aws_iam_openid_connect_provider.platz_control_cluster.arn
}
```

Then pass every per-account role into the `main` module's `k8s_agents` list. Each entry
becomes its own k8s-agent StatefulSet, and each agent discovers clusters across all regions
of its account. Finally, map each agent's IAM role into each target cluster's RBAC (an EKS
access entry or `aws-auth` mapping). See [Clusters](/docs/guide/admin/clusters) for the
RBAC side.

## Customising the install

The `main` module renders a fixed set of chart values. If you need values it doesn't expose,
use the helper submodules (`k8s-agent-role`, `chart-discovery`, `backup`) for the AWS
plumbing and write your own `helm_release`:

```hcl
module "platz_k8s_agent_role" {
  source             = "github.com/platzio/terraform-aws-platzio//modules/k8s-agent-role?ref=v0.7.0-beta.4"
  instance_name      = "default"
  irsa_oidc_provider = local.eks_oidc_provider
  irsa_oidc_arn      = local.eks_oidc_arn
}

resource "helm_release" "platz" {
  name       = "platz"
  repository = "https://platzio.github.io/helm-charts"
  chart      = "platzio"
  version    = "0.7.0-beta.4"

  values = [
    yamlencode({
      auth = { adminEmails = var.admin_emails }
      # ... whatever you want
      k8sAgent = {
        instances = [{
          name     = "default"
          provider = "eks"
          serviceAccount = {
            annotations = {
              "eks.amazonaws.com/role-arn" = module.platz_k8s_agent_role.iam_role_arn
            }
          }
        }]
      }
    })
  ]
}
```

## Backup encryption key

When you enable backups, the CronJob encrypts each dump with a key that must already exist
in a Secret named `backup-config` (key `encryptionKey`). The `backup` submodule creates the
bucket and IAM role, but the secret is created out of band:

```bash
kubectl -n platzio create secret generic backup-config \
  --from-literal="encryptionKey=$(head -c 32 /dev/urandom | base64)"
```

See [Database → Backups](/docs/guide/install/database#backups) for the restore procedure.

## Where to go next

- [Clusters](/docs/guide/admin/clusters) — registering clusters and the EKS auto-discovery /
  cross-account RBAC flow.
- [Helm registries](/docs/guide/admin/helm-registries) — how registries map to deployment
  kinds.
- [Helm install](/docs/guide/install/helm) — the chart's full values reference.
