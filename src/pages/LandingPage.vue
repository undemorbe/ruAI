<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StyleSwitcher from '@/components/landing/StyleSwitcher.vue'
import { DEFAULT_VARIANT, VARIANTS } from '@/landings/registry'
import { storage } from '@/lib/storage'

const route = useRoute()
const router = useRouter()

/** Variant priority: ?v= in URL → last choice in localStorage → default. */
const current = computed(() => {
  const q = Number(route.query.v)
  if (VARIANTS.some((v) => v.id === q)) return q
  const saved = storage.get<number>('ruai.landing', DEFAULT_VARIANT)
  return VARIANTS.some((v) => v.id === saved) ? saved : DEFAULT_VARIANT
})
const variant = computed(() => VARIANTS.find((v) => v.id === current.value)!)

function pick(id: number) {
  storage.set('ruai.landing', id)
  router.replace({ query: { ...route.query, v: String(id) } })
  window.scrollTo({ top: 0 })
}
</script>

<template>
  <component :is="variant.component" :key="variant.id" />
  <StyleSwitcher :current="current" @pick="pick" />
</template>
