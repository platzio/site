<template>
  <div class="docs-toc">
    <div class="category" v-for="category in categories" :key="category.name">
      <label v-if="category.name">
        {{ category.name }}
      </label>
      <div class="item" v-for="item in category.items" :key="item.path">
        <NuxtLink :to="item.path" :exact="true">
          {{ item.title }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";

export interface CollectionItem {
  title: string;
  category?: string;
  position: number;
  path: string;
}

interface Category {
  name: string;
  items: Array<{
    title: string;
    path: string;
  }>;
}

export default Vue.extend({
  props: {
    entireCollection: {
      required: true,
      type: Array as PropType<CollectionItem[]>,
    },
  },

  computed: {
    categories(): Category[] {
      const result: Category[] = [];
      const byName = new Map<string | undefined, Category>();

      const getCategory = (category?: string): Category => {
        const existing = byName.get(category);
        if (existing) {
          return existing;
        }
        const newCategory: Category = {
          name: category || "",
          items: [],
        };
        byName.set(category, newCategory);
        result.push(newCategory);
        return newCategory;
      };

      for (const doc of this.entireCollection) {
        const category = getCategory(doc.category);
        let { title, path } = doc;
        if (path.endsWith("/index")) {
          path = path.slice(0, path.length - "index".length);
        }
        category.items.push({ title, path });
      }

      return result;
    },
  },
});
</script>
