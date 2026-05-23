---
sidebar_position: 2
---

# Installing with Terraform

The [`terraform-aws-platzio`](https://github.com/platzio/terraform-aws-platzio) module is the canonical way to provision Platz on AWS. It wires up everything the helm chart can't create on its own — IAM roles (with IRSA bindings), the SQS queue that ECR push events flow into, the S3 bucket for database backups, and Route 53 records for the ingress hostname.

If you're not on AWS, skip this page; the [Helm install](/docs/guide/install/helm) is what you want.

## What the module provisions

The module is organised into submodules so you can pick the parts you need:

| Submodule    | Resources                                                                                                                                                   | Use it for                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `iam`        | IAM roles for the k8s-agent, chart-discovery, status-updates, resource-sync, and backup-job ServiceAccounts; trust policies bound to your EKS OIDC provider | IRSA-based AWS access from in-cluster pods       |
| `ecr-events` | SQS queue, EventBridge rule, IAM permissions for the queue, CloudWatch log group                                                                            | The chart-discovery worker's `ecr` provider mode |
| `backups`    | S3 bucket with versioning + server-side encryption, lifecycle rules                                                                                         | The optional Postgres backup CronJob             |
| `route53`    | Hosted-zone records pointing at your ingress controller                                                                                                     | Public DNS for the Platz hostname                |
| `main`       | Bundles everything above plus a `helm_release` resource that runs `helm install` with sensible defaults                                                     | One-stop install                                 |

You can use `main` for a quick start, or compose the submodules individually if you have an opinion about how AWS resources should be tagged, named, or placed in your account.

## What it doesn't do

- **It doesn't create your EKS cluster.** You bring an existing cluster (or use a separate Terraform module — `terraform-aws-eks` is fine). The module attaches Platz to it.
- **It doesn't create the Postgres database.** RDS, Aurora, or anything else — bring your own. The module accepts the database connection info as variables and stuffs them into a Kubernetes Secret.
- **It doesn't create the OIDC provider.** That's your IdP. The module accepts the OIDC client ID, client secret, and issuer URL as variables.
- **It doesn't create the ECR repositories.** Existing ECR repos are picked up automatically by chart-discovery once the SQS queue exists — but the repos themselves are your responsibility.

## Typical structure

A minimum-viable use of the `main` module:

```hcl
module "platz" {
  source = "github.com/platzio/terraform-aws-platzio//modules/main?ref=v0.6.8"

  # Required: how to reach the EKS cluster and which OIDC provider IRSA is bound to.
  cluster_name        = "prod-us-east-1"
  oidc_provider_arn   = data.aws_eks_cluster.this.identity[0].oidc[0].issuer

  # Required: the Postgres database to use.
  database = {
    host     = aws_db_instance.platz.address
    port     = 5432
    username = "platz"
    password = var.platz_db_password
    name     = "platz"
  }

  # Required: OIDC for user login.
  oidc = {
    server_url    = "https://auth.example.com/realms/platz"
    client_id     = "platz"
    client_secret = var.platz_oidc_client_secret
  }

  # Required: who's the initial admin.
  admin_emails = ["admin@example.com"]

  # Required: the public hostname.
  hostname    = "platz.example.com"
  hosted_zone = "example.com"

  # Optional: pin chart and image versions.
  chart_version = "0.6.8"
}
```

`terraform apply`, wait, and Platz is reachable at `https://platz.example.com` once the ingress controller picks up the route and cert-manager (or the AWS Certificate Manager-backed ALB) issues a certificate.

## How the ECR integration works

ECR is event-driven in Platz: there is no polling, no scheduled job. The flow is:

1. A developer runs `helm push ./my-chart oci://123.dkr.ecr.us-east-1.amazonaws.com/my-chart`.
2. ECR emits a `Image action - PUSH` event into EventBridge.
3. The EventBridge rule (created by the `ecr-events` submodule) forwards matching events to an SQS queue.
4. The `platz-chart-discovery` pod, running with an IRSA role that allows `sqs:ReceiveMessage` on that queue, picks the event up.
5. It downloads the chart from ECR using the `ecr get-login-password` flow, extracts the chart, parses the Chart Extension files, and inserts a `helm_charts` row.

The EventBridge rule matches `PUSH` and `DELETE` actions, so charts disappear from Platz automatically when they're deleted from ECR — they're flagged `available: false` rather than removed outright, so existing deployments referencing the chart aren't orphaned.

The chart-discovery worker is **stateful from the queue's perspective only**. There's no backfill: if you create the SQS queue _after_ charts already exist in ECR, those charts won't appear in Platz until they're re-pushed. The workaround is to `helm pull` them yourself, re-push, and watch them appear.

## IAM roles created (IRSA)

The `iam` submodule creates one IAM role per Platz ServiceAccount. The trust policy on each role allows the EKS cluster's OIDC provider to assume the role _only_ for the matching ServiceAccount.

| Role                    | Permissions                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platz-k8s-agent`       | `eks:ListClusters`, `eks:DescribeCluster` across all regions (the agent auto-discovers EKS clusters in the account). For cross-account, you add a trust policy on the _other_ account's role that allows this role to `sts:AssumeRole`.      |
| `platz-chart-discovery` | `sqs:ReceiveMessage`, `sqs:DeleteMessage` on the chart-discovery queue. `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` on `*` (chart-discovery doesn't know in advance which repos it'll need to pull from). |
| `platz-backup`          | `s3:PutObject` on the backup bucket prefix.                                                                                                                                                                                                  |
| `platz-resource-sync`   | None (the worker only touches the database; cluster access goes through k8s ServiceAccount tokens).                                                                                                                                          |
| `platz-status-updates`  | None.                                                                                                                                                                                                                                        |

The chart consumes these role ARNs via `serviceAccount.annotations.eks.amazonaws.com/role-arn` on each pod's ServiceAccount.

## Cross-account EKS

If Platz lives in one AWS account (the "control plane account") and deploys to clusters in other accounts (the "tenant accounts"), the pattern is:

1. In the control-plane account, give the `platz-k8s-agent` IRSA role permission to call `sts:AssumeRole` on the tenant-account role.
2. In each tenant account, create a role with `eks:DescribeCluster` / `eks:ListClusters` and `sts:AssumeRoleWithWebIdentity` on cluster RBAC, with a trust policy that allows the control-plane account's `platz-k8s-agent` role to assume it.
3. In Platz values, add one `k8sAgent.instances[]` entry per tenant account, with `serviceAccount.annotations` set to the _tenant-account_ role ARN — the agent will assume that role and discover clusters in that account.

The Terraform module's `iam` submodule has variables for this — `cross_account_role_arns` — that wire the trust policies up.

## Customising the install

The `main` module is convenient but opinionated. If you want different chart values, the right escape hatch is to use the lower-level submodules (`iam`, `ecr-events`, `backups`) and write your own `helm_release` resource:

```hcl
module "platz_iam" {
  source = "github.com/platzio/terraform-aws-platzio//modules/iam?ref=v0.6.8"
  # ...
}

module "platz_ecr_events" {
  source = "github.com/platzio/terraform-aws-platzio//modules/ecr-events?ref=v0.6.8"
  # ...
}

resource "helm_release" "platz" {
  name       = "platz"
  repository = "https://platzio.github.io/helm-charts"
  chart      = "platzio"
  version    = "0.6.8"

  values = [
    yamlencode({
      auth = { adminEmails = var.admin_emails }
      # ... whatever you want
      k8sAgent = {
        instances = [{
          name = "default"
          provider = "eks"
          serviceAccount = {
            annotations = {
              "eks.amazonaws.com/role-arn" = module.platz_iam.k8s_agent_role_arn
            }
          }
        }]
      }
    })
  ]
}
```

That way you get the IAM and ECR plumbing handled for you, but full control over the chart values.

## Where to go next

- [Clusters](/docs/guide/admin/clusters) — once Platz is installed, this page covers how to register clusters and the EKS auto-discovery flow.
- [Helm registries](/docs/guide/admin/helm-registries) — what registries look like inside Platz, and how to wire a new ECR repository to a deployment kind.
- [Helm install](/docs/guide/install/helm) — the chart's full values reference.
