import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Platz",
  tagline: "Manages Your Helm Deployments",
  favicon: "img/logo.svg",

  future: {
    v4: true,
  },

  url: "https://platz.io",
  baseUrl: "/",

  organizationName: "platzio",
  projectName: "site",

  onBrokenLinks: "throw",

  markdown: {
    mermaid: true,
  },

  themes: ["@docusaurus/theme-mermaid"],

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      {
        createRedirects(existingPath: string) {
          if (existingPath === "/news") {
            return ["/blog"];
          }
          if (existingPath.startsWith("/news/")) {
            return [existingPath.replace(/^\/news\//, "/blog/")];
          }
          return undefined;
        },
      },
    ],
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
        },
        blog: {
          routeBasePath: "news",
          showReadingTime: true,
          feedOptions: {
            type: ["rss", "atom"],
            xslt: true,
          },
          onInlineTags: "warn",
          onInlineAuthors: "warn",
          onUntruncatedBlogPosts: "warn",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
    [
      "redocusaurus",
      {
        // Render the backend's OpenAPI schema as an interactive reference.
        // The spec is fetched from the latest platzio/backend release at build
        // time, so the reference tracks the released API without committing a
        // copy here. To pin a version, swap `latest` for a tag (e.g. v0.7.0).
        specs: [
          {
            id: "platz-api",
            spec: "https://github.com/platzio/backend/releases/latest/download/openapi.yaml",
            route: "/api/",
          },
        ],
        theme: {
          primaryColor: "#8f5739",
        },
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Platz",
      logo: {
        alt: "Platz Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        {
          type: "dropdown",
          label: "API",
          position: "left",
          items: [
            { label: "Reference", to: "/api" },
            { label: "Authentication", to: "/docs/api/auth" },
            { label: "Pagination", to: "/docs/api/pagination" },
            { label: "Permissions", to: "/docs/api/permissions" },
            { label: "Python SDK", to: "/docs/api/sdks/python" },
            { label: "Rust SDK", to: "/docs/api/sdks/rust" },
          ],
        },
        { to: "/news", label: "News", position: "left" },
        {
          href: "https://github.com/platzio",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting Started", to: "/docs/guide/intro" },
            { label: "Installation", to: "/docs/guide/install/helm" },
            { label: "Environments", to: "/docs/guide/envs/clusters" },
            { label: "Deployments", to: "/docs/guide/deployments/overview" },
            {
              label: "Chart Extensions",
              to: "/docs/guide/chart-ext/overview",
            },
            { label: "Administration", to: "/docs/guide/admin/auth" },
            { label: "API Reference", to: "/api" },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "ArtifactHub",
              href: "https://artifacthub.io/packages/helm/platz-io/platzio",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "News",
              to: "/news",
            },
            {
              label: "GitHub",
              href: "https://github.com/platzio",
            },
          ],
        },
      ],
      copyright:
        "Free and open-source under the Apache-2.0 License. Built with Docusaurus.",
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
