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

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
        },
        blog: {
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
          type: "docSidebar",
          sidebarId: "api",
          position: "left",
          label: "API",
        },
        { to: "/blog", label: "Blog", position: "left" },
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
            {
              label: "Tutorial",
              to: "/docs/guide/intro",
            },
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
              label: "Blog",
              to: "/blog",
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
