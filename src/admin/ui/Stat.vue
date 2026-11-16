<script setup lang="ts">
import { computed } from 'vue'

/**
 * Показатель: подпись, значение, пояснение и изменение к прошлому периоду
 * (cur/prev; lowerIsBetter - для расходов и отмен рост окрашивается красным).
 */
const props = defineProps<{ label: string; value: string; sub?: string; tone?: 'bad' | 'good'; cur?: number; prev?: number; lowerIsBetter?: boolean }>()

const delta = computed(() => {
  if (props.cur === undefined || props.prev === undefined) return null
  if (!props.prev) return props.cur ? { text: 'новое', good: !props.lowerIsBetter, flat: false } : null
  const d = ((props.cur - props.prev) / Math.abs(props.prev)) * 100
  if (Math.abs(d) < 0.5) return { text: '0 %', good: true, flat: true }
  const up = d > 0
  return { text: `${up ? '↑' : '↓'} ${Math.abs(d).toLocaleString('ru-RU', { maximumFractionDigits: Math.abs(d) < 10 ? 1 : 0 })} %`, good: up !== !!props.lowerIsBetter, flat: false }
})
</script>

<template>
  <div class="stat">
    <span class="stat__label">{{ label }}</span>
    <strong class="stat__value" :class="tone && `is-${tone}`">{{ value }}</strong>
    <span v-if="delta" class="stat__delta" :class="delta.flat ? 'is-flat' : delta.good ? 'is-up' : 'is-down'" title="К такому же периоду до этого">{{ delta.text }}</span>
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
.stat__delta {
  align-self: flex-start;
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat__delta.is-up {
  background: color-mix(in srgb, var(--ok) 13%, transparent);
  color: var(--ok);
}
.stat__delta.is-down {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}
.stat__delta.is-flat {
  background: var(--bg-sunken);
  color: var(--text-3);
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
