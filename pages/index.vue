<template>
  <div>
    <div class="container my-5 pb-5">
      <div class="primary-header">Platz</div>
      <div class="secondary-header">Let Everyone Deploy Helm Charts</div>
      <div class="my-4 d-flex flex-row">
        <NuxtLink to="/docs/" class="me-3 btn btn-lg btn-primary">
          Learn More
        </NuxtLink>
        <NuxtLink
          to="/docs/install/helm"
          class="btn btn-lg btn-outline-primary"
        >
          Get Started
        </NuxtLink>
      </div>
      <div class="my-3 lead text-secondary">
        Latest release: <strong>{{ latestRelease[0].release }}</strong>
      </div>
    </div>

    <div class="my-5">
      <PlatzFooter />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.primary-header {
  font-size: 4rem;
  font-weight: 700;
}

.secondary-header {
  font-size: 2rem;
  color: var(--bs-secondary);
}
</style>

<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  layout: "content",

  async asyncData({ $content }) {
    const latestRelease = await $content("blog", { deep: true })
      .only(["group", "release"])
      .where({ group: "releases" })
      .sortBy("date", "desc")
      .limit(1)
      .fetch();

    return {
      latestRelease,
    };
  },
});
</script>
