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
