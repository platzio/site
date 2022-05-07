<template>
  <div class="platz-docs">
    <div class="toc">
      <PlatzToc :allDocs="allDocs" />
    </div>
    <div class="content">
      <h1>{{ page.title }}</h1>
      <p>{{ page.description }}</p>
      <nuxt-content :document="page" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.platz-docs {
  width: 100%;
  display: flex;
  flex-direction: row;

  > .toc {
    width: 10rem;
    margin-right: 2rem;
  }

  > .content {
    font-size: 1.125rem;
    flex-basis: 100%;

    &:first {
      margin-top: 0;
    }
  }
}
</style>

<script lang="ts">
import { NuxtError } from "@nuxt/types";
import Vue from "vue";

const Collections = ["docs", "api"];

function getCollectionAndPath(
  pathMatch: string,
  error: (err: NuxtError) => void
): { collection: string; path: string } | undefined {
  for (const collection of Collections) {
    if (!pathMatch.startsWith(collection)) {
      continue;
    }
    let path = pathMatch.slice(collection.length);
    if (path.startsWith("/")) {
      path = path.slice(1);
    }
    if (path.length === 0) {
      path = "/index";
    }
    return { collection, path };
  }
}

export default Vue.extend({
  layout: "docs",

  async asyncData({ $content, params, error }) {
    const collectionAndPath = getCollectionAndPath(params.pathMatch, error);
    if (!collectionAndPath) {
      error({ statusCode: 404, message: "Page not found" });
      return;
    }
    const { collection, path } = collectionAndPath;

    const page = await $content(collection, { deep: true }, path)
      .fetch()
      .catch((err) => {
        error({ statusCode: 404, message: "Page not found" });
      });

    const allDocs = await $content(collection, { deep: true })
      .only(["title", "category", "position", "path"])
      .sortBy("position")
      .fetch();

    return {
      allDocs,
      page,
    };
  },
});
</script>
