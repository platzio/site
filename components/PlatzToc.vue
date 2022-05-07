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

<style lang="scss">
$spacing: 0.6rem;

.docs-toc {
  .category {
    margin-top: $spacing * 2.35;
    margin-bottom: $spacing;

    label {
      text-transform: uppercase;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--bs-secondary);
      opacity: 0.5;
    }

    &:first-child {
      margin-top: 0;
    }
  }

  .item {
    margin-top: $spacing;

    a {
      color: var(--bs-secondary);
      display: block;

      &.nuxt-link-active {
        font-weight: 600;
        border-left: 0.2rem solid var(--bs-danger);
        padding-left: 0.35rem;
        margin-left: -0.55rem;
      }
    }
  }
}
</style>

<script lang="ts">
import Vue, { PropType } from "vue";

interface Doc {
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
    allDocs: {
      required: true,
      type: Array as PropType<Doc[]>,
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

      for (const doc of this.allDocs) {
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
