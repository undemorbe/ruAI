<script setup lang="ts">
import { MARK_PATH, MARK_STROKE } from '@/content/brand'

/** Знак сервиса. tile — светлый знак на плитке цвета currentColor; без tile — знак цвета currentColor. */
withDefaults(defineProps<{ tile?: boolean }>(), { tile: false })
</script>

<template>
  <svg class="bm" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <template v-if="tile">
      <rect width="64" height="64" rx="15" fill="currentColor" />
      <path :d="MARK_PATH" class="bm__on-tile" transform="translate(32 32) scale(.86) translate(-32 -32)" fill="none" :stroke-width="MARK_STROKE" />
    </template>
    <path v-else :d="MARK_PATH" fill="none" stroke="currentColor" :stroke-width="MARK_STROKE" />
  </svg>
</template>

<style scoped>
.bm {
  display: block;
  width: 100%;
  height: 100%;
}
.bm__on-tile {
  stroke: var(--bm-on-tile, #fff);
}
</style>
