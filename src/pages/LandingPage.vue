<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WordsLanding from '@/landings/words/WordsLanding.vue'
import { VARIANTS } from '@/landings/legacy/registry'

const StyleSwitcher = defineAsyncComponent(() => import('@/landings/legacy/StyleSwitcher.vue'))

const route = useRoute()
const router = useRouter()

/** The main landing is «Слова из частиц». /?v=<id> previews an archived direction (src/landings/legacy). */
const legacy = computed(() => VARIANTS.find((v) => v.id === Number(route.query.v)) ?? null)

function pick(id: number | null) {
  const query = { ...route.query }
  if (id === null) delete query.v
  else query.v = String(id)
  router.replace({ query })
  window.scrollTo({ top: 0 })
}
</script>

<template>
  <template v-if="legacy">
    <component :is="legacy.component" :key="legacy.id" />
    <StyleSwitcher :current="legacy.id" @pick="pick" />
  </template>
  <WordsLanding v-else />
</template>
