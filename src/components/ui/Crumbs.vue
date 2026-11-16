<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { seoForPath } from '@/seo/pages'

/** Видимые хлебные крошки; совпадают с BreadcrumbList в JSON-LD (src/seo/pages.ts). */
const route = useRoute()
const crumbs = computed(() => seoForPath(route.path).crumbs)
</script>

<template>
  <nav v-if="crumbs.length > 1" class="cr" aria-label="Навигационная цепочка">
    <template v-for="(c, i) in crumbs" :key="c.path">
      <span v-if="i === crumbs.length - 1" aria-current="page">{{ c.name }}</span>
      <template v-else>
        <RouterLink :to="c.path">{{ c.name }}</RouterLink>
        <span class="cr__sep" aria-hidden="true">›</span>
      </template>
    </template>
  </nav>
</template>

<style scoped>
.cr {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--text-3);
}
.cr a {
  color: var(--text-2);
}
.cr a:hover {
  color: var(--text);
}
</style>
