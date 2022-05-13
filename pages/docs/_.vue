<template>
  <PlatzDocsPage :page="page" :entireCollection="entireCollection" />
</template>

<script lang="ts">
import Vue from "vue";
import { asyncData } from "~/content-util";

export default Vue.extend({
  layout: "content",
  asyncData,
});
</script>
