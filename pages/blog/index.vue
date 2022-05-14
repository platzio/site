<template>
  <div>
    <div v-for="item in entireCollection" :key="item.title" class="card mb-4">
      <div class="card-body p-4">
        <NuxtLink :to="item.path">
          <div class="d-flex flex-row align-items-center">
            <div class="flex-fill">
              <div class="my-2 h3 fw-bold">
                {{ item.title }}
              </div>
              <div class="my-2 d-flex flex-row align-items-center">
                <div class="me-2">
                  <div class="badge bg-success text-uppercase">
                    {{ item.group }}
                  </div>
                </div>
                <div
                  class="fw-bold text-capitalize text-muted d-none d-sm-block"
                >
                  {{ $moment(item.date).format("LLLL") }}
                </div>
                <div class="mx-2 text-muted opacity-50 d-none d-sm-block">
                  /
                </div>
                <div class="text-capitalize text-muted">
                  {{ $moment(item.date).fromNow() }}
                </div>
              </div>
            </div>
            <div></div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  layout: "content",

  async asyncData({ $content }) {
    const entireCollection = await $content("blog", { deep: true })
      .only(["title", "date", "path", "group"])
      .sortBy("date", "desc")
      .fetch();

    return {
      entireCollection,
    };
  },
});
</script>
