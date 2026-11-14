<script setup lang="ts">
/** Блок отчёта с заголовком. */
defineProps<{ title: string; note?: string }>()
</script>

<template>
  <section class="panel">
    <header class="panel__head">
      <h2>{{ title }}</h2>
      <span v-if="note" class="panel__note">{{ note }}</span>
      <span v-if="$slots.aside" class="panel__aside"><slot name="aside" /></span>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--bg-elev);
}
.panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 12px;
}
h2 {
  margin: 0;
  font: 600 15px/1.3 var(--font-display);
}
.panel__note {
  color: var(--text-3);
  font-size: 12.5px;
}
.panel__aside {
  margin-left: auto;
}
</style>
