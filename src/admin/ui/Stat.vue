<script setup lang="ts">
/** Показатель: подпись, значение, пояснение. */
defineProps<{ label: string; value: string; sub?: string; tone?: 'bad' | 'good' }>()
</script>

<template>
  <div class="stat">
    <span class="stat__label">{{ label }}</span>
    <strong class="stat__value" :class="tone && `is-${tone}`">{{ value }}</strong>
    <span v-if="sub" class="stat__sub">{{ sub }}</span>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--bg-elev);
}
.stat__label {
  color: var(--text-2);
  font-size: 13px;
}
.stat__value {
  font: 600 22px/1.2 var(--font-display);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.stat__value.is-bad {
  color: var(--danger);
}
.stat__value.is-good {
  color: var(--ok);
}
.stat__sub {
  color: var(--text-3);
  font-size: 12.5px;
}
@media (max-width: 520px) {
  .stat {
    padding: 12px;
  }
  .stat__value {
    font-size: 19px;
  }
}
</style>
