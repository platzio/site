<template>
  <div>
    <div class="mb-3">
      <NuxtLink to="/blog/">↩ Back to all posts</NuxtLink>
    </div>

    <div class="row">
      <div class="col-lg" />
      <div class="col-lg-8">
        <div class="nuxt-content">
          <div class="h1">
            {{ page.title }}
          </div>
        </div>
        <nuxt-content :document="page" />
      </div>
      <div class="col-lg" />
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  layout: "content",
  async asyncData({ $content, error, params }) {
    const page = await $content("blog", { deep: true }, params.pathMatch)
      .fetch()
      .catch((err) => {
        error({ statusCode: 404, message: "Page not found" });
      });

    return { page };
  },
});
</script>
