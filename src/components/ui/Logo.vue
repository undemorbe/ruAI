<script setup lang="ts">
withDefaults(defineProps<{ size?: number; mark?: boolean }>(), { size: 28, mark: true })
</script>

<template>
  <span class="logo" :style="{ '--s': `${size}px` }">
    <svg v-if="mark" class="logo__mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <path d="M18 46V18h12a9 9 0 0 1 2 17.8L40 46h-7l-7.4-10H24v10zm6-15h6a4 4 0 0 0 0-8h-6z" class="logo__r" />
      <circle cx="46" cy="22" r="5" fill="var(--accent, #ff5a36)" />
    </svg>
    <span class="logo__word">ru<b>AI</b></span>
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
