import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import CodeBlock from "@theme/CodeBlock";
import styles from "./index.module.css";

/* ------------------------------------------------------------------ */
/* Icons                                                              */
/* ------------------------------------------------------------------ */
type IconProps = { size?: number };

const svgProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Icon = {
  Cube: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
      <path d="m3 7 9 5 9-5M12 12v10" />
    </svg>
  ),
  Form: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 8h7M7 12h10M7 16h5" />
    </svg>
  ),
  Pulse: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M3 12h4l2-6 4 14 2-8h6" />
    </svg>
  ),
  Layers: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  History: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </svg>
  ),
  Check: ({ size = 18 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...svgProps}
      strokeWidth={2.4}
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  ),
  Github: ({ size = 20 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12 11.5 11.5 0 0 0 8.4 23c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  ),
  Arrow: ({ size = 18 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...svgProps}
      strokeWidth={2.2}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */
function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroGrid} />
      <div className={styles.heroInner}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} />
          Open source &middot; Self-hosted &middot; Apache-2.0
        </span>
        <Heading as="h1" className={styles.heroTitle}>
          Platz manages your{" "}
          <span className={styles.heroAccent}>Helm deployments</span>.
        </Heading>
        <p className={styles.heroSubtitle}>
          A self-hosted control plane for Kubernetes. Install Platz once, point
          it at your registries and clusters, and give every team a typed UI for
          every chart &mdash; backed by environments, role-based permissions,
          full history, and live metrics from each running deployment.
        </p>
        <div className={styles.heroCtas}>
          <Link className={styles.btnPrimary} to="/docs/guide/intro">
            Read the docs <Icon.Arrow />
          </Link>
          <Link className={styles.btnGhost} href="https://github.com/platzio">
            <Icon.Github /> Source on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Feature sections                                                   */
/* ------------------------------------------------------------------ */
type Feature = {
  id: string;
  kicker: string;
  icon: ReactNode;
  title: string;
  body: ReactNode;
  bullets?: { title: string; text: ReactNode }[];
  snippet?: { lang: string; code: string; caption?: string };
  docHref: string;
  docLabel: string;
};

const VALUES_UI_EXAMPLE = `apiVersion: platz.io/v1beta1
kind: ValuesUi
inputs:
  - id: domain_name
    type: text
    label: Domain name
    required: true

  - id: replica_count
    type: number
    label: Replica count
    initialValue: 1
    minimum: 1
    maximum: 10

  - id: database
    type: CollectionSelect
    label: Database
    collection: Secret

  - id: enable_delivery
    type: checkbox
    label: Enable delivery

  - id: delivery_zones
    type: text
    label: Delivery zones
    showIf: { var: enable_delivery }

outputs:
  values:
    - path: [ image, tag ]
      value: "{{ chart.image_tag }}"
    - path: [ replicaCount ]
      value: { input: replica_count }
`;

const CHART_YAML_EXAMPLE = `apiVersion: v2
name: shop
version: 0.1.0
appVersion: "0.1.0"

annotations:
  platz.io/git/commit: a8c1da83308d93b111c14f0c79e0b9acf7f01686
  platz.io/git/branch: main
  platz.io/git/repo: https://github.com/pizza-platz/shop
  platz.io/git/provider: github
`;

const FEATURES: Feature[] = [
  {
    id: "deployments",
    kicker: "Deployments",
    icon: <Icon.Cube />,
    title: "A deployment is one Helm release Platz manages for you",
    body: (
      <>
        Each deployment maps one-to-one to a Kubernetes namespace and a Helm
        release inside it. You give it a name, pick a chart version, choose the
        cluster, and fill in the form. Platz writes a task, the in-cluster agent
        runs <code>helm install</code> or <code>helm upgrade</code>, and the
        result lands back in the UI.
      </>
    ),
    bullets: [
      {
        title: "One namespace per deployment",
        text: "Labelled platz=yes so resource-sync picks it up automatically.",
      },
      {
        title: "Enable / disable without losing state",
        text: "Disabling uninstalls the release but keeps the config and history.",
      },
      {
        title: "Values override as an escape hatch",
        text: "Owner-only raw YAML layered on top of the form values when the form can't express it.",
      },
    ],
    docHref: "/docs/guide/deployments/overview",
    docLabel: "Deployments overview",
  },
  {
    id: "chart-extensions",
    kicker: "Charts & Extensions",
    icon: <Icon.Form />,
    title: "Charts are discovered automatically and described in YAML",
    body: (
      <>
        The <code>platz-chart-discovery</code> worker watches your Helm OCI
        registries &mdash; ECR via SQS events, generic OCI registries via
        polling &mdash; and surfaces every new version within seconds. Charts
        that bundle a <code>platz/</code> directory get richer treatment:{" "}
        <code>values-ui.yaml</code> becomes a typed form,{" "}
        <code>features.yaml</code> declares status and ingress,{" "}
        <code>actions.yaml</code> defines custom operations, and{" "}
        <code>resources.yaml</code> registers child resource types your service
        owns.
      </>
    ),
    bullets: [
      {
        title: "Auto-discovery from any OCI registry",
        text: "ECR uses push/delete events on SQS; generic OCI registries are polled.",
      },
      {
        title: "Upgrades surface as a one-click action",
        text: "When a newer version of an installed chart lands, every deployment of that kind shows an upgrade badge.",
      },
      {
        title: "Reinstall on dependency change",
        text: (
          <>
            Reference an env secret or another deployment from a chart input and
            Platz triggers a Reinstall when the dependency changes &mdash; with
            a recorded reason.
          </>
        ),
      },
      {
        title: "Git metadata via Chart.yaml annotations",
        text: (
          <>
            Stamp <code>platz.io/git/commit</code>, <code>branch</code>,{" "}
            <code>repo</code>, and <code>provider</code> on the chart and Platz
            threads them through the UI &mdash; so the deployment list shows the
            exact commit and branch a release came from.
          </>
        ),
      },
      {
        title: "Chart Playground",
        text: "An in-app sandbox for chart extension authors to validate inputs against real env data before publishing a new chart version.",
      },
      {
        title: "Cardinality control",
        text: "Declare a chart OnePerCluster (singleton) or Many (multiple instances per cluster).",
      },
    ],
    snippet: {
      lang: "yaml",
      caption: "platz/values-ui.yaml — excerpt",
      code: VALUES_UI_EXAMPLE,
    },
    docHref: "/docs/guide/chart-ext/overview",
    docLabel: "Chart Extensions",
  },
  {
    id: "metrics",
    kicker: "In-app Metrics",
    icon: <Icon.Pulse />,
    title: "Live status and metrics, reported by the chart itself",
    body: (
      <>
        When a chart opts in to the Status feature, the{" "}
        <code>platz-status-updates</code> worker polls a status endpoint on the
        deployment&apos;s standard ingress and writes the result back to the
        database. The UI shows a color-coded badge, an optional{" "}
        <strong>primary metric</strong> directly in the deployment list, and a
        full metrics grid on the deployment page &mdash; with no Prometheus or
        Grafana required to get started.
      </>
    ),
    bullets: [
      {
        title: "Per-deployment primary metric",
        text: "One number you care about most, surfaced right on the list row.",
      },
      {
        title: "Notices for chart-defined warnings",
        text: "Charts can report soft problems that show up as banners.",
      },
      {
        title: "Updates streamed live",
        text: "Status changes broadcast over WebSocket so the UI never goes stale.",
      },
    ],
    docHref: "/docs/guide/deployments/status",
    docLabel: "Status feature",
  },
  {
    id: "envs",
    kicker: "Environments",
    icon: <Icon.Layers />,
    title: "Envs are Platz's top-level boundary",
    body: (
      <>
        An <strong>env</strong> is a named group of clusters, the deployments
        that run on them, and the people who can touch any of it. Production
        lives in one env, staging in another, your dogfood cluster in a third
        &mdash; each isolated, each with its own settings and roster. Switching
        between them is a single click in the navbar, and every form on the page
        is scoped to the env you&apos;re in.
      </>
    ),
    bullets: [
      {
        title: "Rich, env-scoped settings",
        text: "Attached clusters, env secrets (referenced from chart inputs), ingress defaults, role assignments, and a per-env Playground for chart authors.",
      },
      {
        title: "Three RBAC layers that compose",
        text: (
          <>
            <strong>Site admin</strong> is the global override.{" "}
            <strong>Env-level</strong> roles (Admin, User) decide who sees and
            configures an env. <strong>Deployment-level</strong> roles (Owner,
            Maintainer) decide who can create or modify deployments of a
            specific kind inside it.
          </>
        ),
      },
      {
        title: "OIDC for humans, bots for automation",
        text: "Users authenticate via any OIDC provider (Auth0, Keycloak, Dex, Google). CI pipelines and GitOps controllers use scoped bot tokens — no shared human credentials.",
      },
      {
        title: "Cluster ↔ env is a one-way attach",
        text: "A cluster belongs to at most one env. Site admins do the attaching; env users see only what's been attached.",
      },
    ],
    docHref: "/docs/guide/envs/clusters",
    docLabel: "Environments & permissions",
  },
  {
    id: "history",
    kicker: "History",
    icon: <Icon.History />,
    title: "Every action is recorded as a task",
    body: (
      <>
        Install, Upgrade, Reinstall, Recreate, Uninstall, InvokeAction,
        RestartK8sResource &mdash; every operation Platz performs against a
        deployment is a row in the <code>deployment_tasks</code> table, with the
        user (or bot) who triggered it, when, and the captured output. If a task
        fails, the stderr from the helm pod is in the task itself, so debugging
        is a click rather than a hunt through three log aggregators.
      </>
    ),
    bullets: [
      {
        title: "Pending → Started → Done / Failed / Canceled",
        text: "The lifecycle every task moves through.",
      },
      {
        title: "Acting user, bot, or deployment",
        text: "Exactly one of the three is recorded — so cross-service automation stays auditable.",
      },
      {
        title: "Why a reinstall happened",
        text: "Reinstall tasks carry the reason (a secret changed, a dependency was redeployed).",
      },
    ],
    docHref: "/docs/guide/deployments/tasks-and-history",
    docLabel: "Tasks & History",
  },
];

function FeatureSection({
  feature,
  index,
}: {
  feature: Feature;
  index: number;
}) {
  return (
    <section
      id={feature.id}
      className={clsx(styles.feature, index % 2 === 1 && styles.featureAlt)}
    >
      <div className={styles.featureInner}>
        <div className={styles.featureHead}>
          <div className={styles.featureHeading}>
            <div className={styles.featureIcon}>{feature.icon}</div>
            <span className={styles.kicker}>{feature.kicker}</span>
          </div>
          <Heading as="h2" className={styles.featureTitle}>
            {feature.title}
          </Heading>
          <p className={styles.featureBody}>{feature.body}</p>
          <Link className={styles.featureLink} to={feature.docHref}>
            {feature.docLabel} <Icon.Arrow size={16} />
          </Link>
        </div>
        {feature.bullets && (
          <ul className={styles.featureBullets}>
            {feature.bullets.map((b) => (
              <li key={b.title}>
                <strong>{b.title}.</strong> {b.text}
              </li>
            ))}
          </ul>
        )}
        {feature.snippet && (
          <div className={styles.snippetWrap}>
            <CodeBlock language={feature.snippet.lang}>
              {feature.snippet.code}
            </CodeBlock>
            {feature.snippet.caption && (
              <p className={styles.snippetCaption}>{feature.snippet.caption}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Support matrix                                                     */
/* ------------------------------------------------------------------ */
type SupportRow = {
  category: string;
  item: string;
  discovery: string;
  notes: ReactNode;
};

const SUPPORT_ROWS: SupportRow[] = [
  {
    category: "Kubernetes clusters",
    item: "Amazon EKS",
    discovery: "Auto-discovered",
    notes: (
      <>
        <code>k8s-agent</code> in <code>eks</code> mode walks every AWS region
        in the account and registers every EKS cluster it can reach.
      </>
    ),
  },
  {
    category: "Kubernetes clusters",
    item: "Local / kubeconfig",
    discovery: "Manual",
    notes: (
      <>
        <code>k8s-agent</code> in <code>local</code> mode registers a single
        cluster from a kubeconfig context. Used by the dev stack and
        bring-your-own-cluster installs.
      </>
    ),
  },
  {
    category: "Helm registries",
    item: "Amazon ECR",
    discovery: "Auto-discovered",
    notes: (
      <>
        <code>chart-discovery</code> in <code>ecr</code> mode subscribes to an
        SQS queue fed by ECR push/delete events — new chart versions appear in
        seconds.
      </>
    ),
  },
  {
    category: "Helm registries",
    item: "Generic OCI",
    discovery: "Auto-discovered",
    notes: (
      <>
        <code>chart-discovery</code> in <code>oci</code> mode polls any registry
        that implements the OCI Distribution Spec on a configurable interval.
      </>
    ),
  },
  {
    category: "Authentication",
    item: "Any OIDC provider",
    discovery: "Standard",
    notes: (
      <>
        Auth0, Keycloak, Dex, Google, GitHub via an OIDC bridge — anything that
        speaks OpenID Connect.
      </>
    ),
  },
  {
    category: "Database",
    item: "PostgreSQL 15+",
    discovery: "External",
    notes: (
      <>
        Managed RDS / Aurora / Cloud SQL or self-managed — Platz treats it as
        external. Built and tested against PostgreSQL 17.
      </>
    ),
  },
  {
    category: "Ingress",
    item: "Any v1 Ingress controller",
    discovery: "Existing",
    notes: (
      <>
        <code>ingress-nginx</code>, AWS Load Balancer Controller, Traefik, and
        others. <code>cert-manager</code> optional for auto-issued certificates.
      </>
    ),
  },
];

function SupportSection() {
  return (
    <section id="support" className={styles.support}>
      <div className={styles.supportInner}>
        <span className={styles.kicker}>What Platz supports</span>
        <Heading as="h2" className={styles.supportTitle}>
          Clusters, registries, and everything in between
        </Heading>
        <p className={styles.supportLead}>
          Platz is designed to live next to what you already run. Cluster
          providers and chart registries are pluggable; the workers ship in two
          modes each.
        </p>
        <div className={styles.supportTableWrap}>
          <table className={styles.supportTable}>
            <thead>
              <tr>
                <th>Category</th>
                <th>What</th>
                <th>Discovery</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORT_ROWS.map((row, i) => {
                const prev = SUPPORT_ROWS[i - 1];
                const showCategory = !prev || prev.category !== row.category;
                return (
                  <tr key={row.category + row.item}>
                    <td className={styles.supportCategory}>
                      {showCategory ? row.category : ""}
                    </td>
                    <td className={styles.supportItem}>{row.item}</td>
                    <td>
                      <span className={styles.discoveryPill}>
                        <Icon.Check size={12} />
                        {row.discovery}
                      </span>
                    </td>
                    <td className={styles.supportNotes}>{row.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pizza-Platz callout                                                */
/* ------------------------------------------------------------------ */
function PizzaCallout() {
  return (
    <section className={styles.pizza}>
      <div className={styles.pizzaInner}>
        <span className={styles.kicker}>Reference app</span>
        <Heading as="h2" className={styles.pizzaTitle}>
          See Platz on a real codebase
        </Heading>
        <p className={styles.pizzaBody}>
          <Link href="https://github.com/pizza-platz">Pizza-Platz</Link> is an
          open-source set of repositories &mdash; shop, bank, farm, supplier,
          agency, customer &mdash; each shipped as a Helm chart with a Chart
          Extension. It&apos;s a worked example of how real services use Platz:
          how their <code>values-ui.yaml</code> is structured, how they surface
          status, how they wire deployment-to-deployment references, and how
          their <code>Chart.yaml</code> stamps the Git metadata Platz threads
          through the UI.
        </p>
        <div className={styles.snippetWrap}>
          <CodeBlock language="yaml">{CHART_YAML_EXAMPLE}</CodeBlock>
          <p className={styles.snippetCaption}>
            Chart.yaml — Git annotations Platz surfaces in the UI
          </p>
        </div>
        <Link className={styles.btnGhost} href="https://github.com/pizza-platz">
          <Icon.Github /> github.com/pizza-platz
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Install CTA                                                        */
/* ------------------------------------------------------------------ */
function InstallSection() {
  return (
    <section className={styles.install}>
      <div className={styles.installInner}>
        <span className={styles.kicker}>Get started</span>
        <Heading as="h2" className={styles.installTitle}>
          Install Platz with Helm
        </Heading>
        <p className={styles.installBody}>
          You&apos;ll need a Kubernetes cluster, a PostgreSQL database, and an
          OIDC provider. The full install guide walks through the secrets,
          ingress, and per-cluster agent setup.
        </p>
        <div className={styles.installSnippet}>
          <CodeBlock language="bash">
            {`helm repo add platzio https://platzio.github.io/helm-charts
helm install platz platzio/platzio -n platzio`}
          </CodeBlock>
        </div>
        <div className={styles.heroCtas}>
          <Link className={styles.btnPrimary} to="/docs/guide/install/helm">
            Install guide <Icon.Arrow />
          </Link>
          <Link className={styles.btnGhost} to="/docs/guide/intro">
            What is Platz?
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tech stack                                                         */
/* ------------------------------------------------------------------ */
type Tech = { name: string; role: string; emoji: string };

const TECH_STACK: Tech[] = [
  { emoji: "🦀", name: "Rust", role: "Backend, five workers, the SDKs" },
  { emoji: "🟢", name: "Vue 3", role: "Single-page web frontend" },
  { emoji: "🐘", name: "PostgreSQL", role: "Source of truth for state" },
  { emoji: "🅱️", name: "Bootstrap", role: "UI styles, dark mode" },
  { emoji: "🛢️", name: "Diesel", role: "Schema and migrations" },
  { emoji: "⚡", name: "Tokio + Actix", role: "Async runtime and HTTP server" },
  { emoji: "🔌", name: "WebSocket", role: "Live UI updates from DB events" },
  { emoji: "🛞", name: "Helm", role: "What Platz manages" },
  { emoji: "☸️", name: "Kubernetes", role: "Where Platz runs and deploys" },
  { emoji: "🔐", name: "OpenID Connect", role: "User authentication" },
  { emoji: "📦", name: "OCI Distribution", role: "Chart registry protocol" },
  { emoji: "🦖", name: "Docusaurus", role: "This site" },
];

function TechSection() {
  return (
    <section className={styles.tech}>
      <div className={styles.techInner}>
        <span className={styles.kicker}>Built with</span>
        <Heading as="h2" className={styles.techTitle}>
          The tech under the hood
        </Heading>
        <p className={styles.techLead}>
          Platz is open source under Apache-2.0 across every repo. The big
          pieces:
        </p>
        <ul className={styles.techGrid}>
          {TECH_STACK.map((t) => (
            <li key={t.name}>
              <span className={styles.techEmoji} aria-hidden="true">
                {t.emoji}
              </span>
              <div className={styles.techText}>
                <strong>{t.name}</strong>
                <span>{t.role}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */
export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Platz — manages your Helm deployments"
      description={siteConfig.tagline}
    >
      <div className={styles.page}>
        <Hero />
        {FEATURES.map((f, i) => (
          <FeatureSection key={f.id} feature={f} index={i} />
        ))}
        <SupportSection />
        <PizzaCallout />
        <TechSection />
        <InstallSection />
      </div>
    </Layout>
  );
}
