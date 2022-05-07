<template>
  <img src="@/static/Logo.svg" :style="imgStyle" />
</template>

<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  props: {
    size: {
      type: String,
      default: "2rem",
    },
  },

  computed: {
    imgStyle() {
      return {
        width: this.size,
        height: this.size,
      };
    },
  },
});
</script>
