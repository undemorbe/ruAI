<script setup lang="ts">
withDefaults(defineProps<{ size?: number; mark?: boolean }>(), { size: 28, mark: true })
</script>

<template>
  <span class="logo" :style="{ '--s': `${size}px` }">
    <svg v-if="mark" class="logo__mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <path d="M15 22a7 7 0 0 1 7-7h20a7 7 0 0 1 7 7v13a7 7 0 0 1-7 7H31l-9 7v-7a7 7 0 0 1-7-7z" class="logo__r" />
    </svg>
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
  width: var(--s);
  height: var(--s);
  color: var(--ink, #16151a);
}
.logo__r {
  fill: var(--ink-text, #fff);
}
.logo__word b {
  font-weight: 800;
}
</style>
