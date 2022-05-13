export default {
  target: "static",

  head: {
    title: "Platz",
    htmlAttrs: {
      lang: "en",
    },
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { hid: "description", name: "description", content: "" },
      { name: "format-detection", content: "telephone=no" },
    ],
    link: [
      { rel: "icon", type: "image/x-icon", href: "/Logo.svg" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600;1,700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&display=swap",
      },
    ],
  },

  css: ["~/style/main.scss"],

  plugins: [],

  components: true,

  buildModules: [
    "@nuxtjs/moment",
    "@nuxt/components",
    "@nuxt/typescript-build",
  ],

  modules: ["@nuxt/content", "@nuxtjs/google-gtag"],

  content: {},

  build: {},

  "google-gtag": {
    id: "G-X2J6J0J06X",
  },
};
