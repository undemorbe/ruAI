<script setup lang="ts">
import BrandMark from './BrandMark.vue'

withDefaults(defineProps<{ size?: number; mark?: boolean }>(), { size: 28, mark: true })
</script>

<template>
  <span class="logo" :style="{ '--s': `${size}px` }">
    <span v-if="mark" class="logo__mark"><BrandMark tile /></span>
    <span class="logo__word">Chat<b>GPT</b></span>
  </span>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--s) * 0.32);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: calc(var(--s) * 0.64);
  letter-spacing: -0.02em;
  line-height: 1;
}
.logo__mark {
  flex: none;
  width: var(--s);
  height: var(--s);
  color: var(--ink, #16151a);
  --bm-on-tile: var(--ink-text, #fff);
}
.logo__word b {
  font-weight: 800;
}
</style>
