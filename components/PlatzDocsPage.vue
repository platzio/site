<template>
  <div class="platz-docs">
    <div class="toc">
      <PlatzToc :entireCollection="entireCollection" />
    </div>
    <div class="content">
      <h1>{{ page.title }}</h1>
      <p>{{ page.description }}</p>
      <nuxt-content :document="page" />
    </div>
  </div>
</template>

<script lang="ts">
import { FetchReturn } from "@nuxt/content/types/query-builder";
import Vue, { PropType } from "vue";
import { CollectionItem } from "./PlatzToc.vue";

export default Vue.extend({
  props: {
    page: {
      required: true,
      type: Object as PropType<void | FetchReturn | FetchReturn[]>,
    },
    entireCollection: {
      required: true,
      type: Array as PropType<CollectionItem[]>,
    },
  },
});
</script>
