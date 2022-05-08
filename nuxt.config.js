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
    link: [{ rel: "icon", type: "image/x-icon", href: "/Logo.svg" }],
  },

  css: ["~/style/main.scss"],

  plugins: [],

  components: true,

  buildModules: ["@nuxt/components", "@nuxt/typescript-build"],

  modules: ["@nuxt/content", "@nuxtjs/google-gtag"],

  content: {},

  build: {},

  "google-gtag": {
    id: "G-X2J6J0J06X",
  },
};
