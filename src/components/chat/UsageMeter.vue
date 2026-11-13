<script setup lang="ts">
import { computed } from 'vue'
import type { Usage } from '@/api'
import { pluralRu } from '@/lib/format'
import { remaining } from '@/lib/limits'

/** Остаток запросов: сутки (сброс 00:00 МСК) и весь период. Без подписки — ссылка на тарифы. */
const props = defineProps<{ usage: Usage | null }>()

const left = computed(() => (props.usage ? remaining(props.usage) : 0))
const dailyLeft = computed(() => (props.usage ? Math.max(0, props.usage.dailyLimit - props.usage.dailyUsed) : 0))
const totalLeft = computed(() => (props.usage ? Math.max(0, props.usage.totalLimit - props.usage.totalUsed) : 0))
const share = computed(() => (props.usage ? left.value / props.usage.dailyLimit : 0))
const title = computed(() =>
  props.usage
    ? `Сегодня осталось ${dailyLeft.value} из ${props.usage.dailyLimit} (сброс в 00:00 МСК). За период — ${totalLeft.value} из ${props.usage.totalLimit}.`
    : '',
)
</script>

<template>
  <RouterLink v-if="!usage" to="/pricing" class="um um--off">Оформить подписку</RouterLink>
  <RouterLink v-else to="/pricing" class="um" :class="{ 'is-low': share <= 0.1 }" :title="title" :aria-label="title">
    <span class="um__bar" aria-hidden="true"><i :style="{ transform: `scaleX(${Math.min(1, share)})` }" /></span>
    <span class="um__txt"><b>{{ left }}</b> {{ pluralRu(left, ['запрос', 'запроса', 'запросов']) }}<span class="um__long"> на сегодня</span></span>
  </RouterLink>
</template>

<style scoped>
.um {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-2);
  white-space: nowrap;
  transition:
    background 0.2s,
    color 0.2s;
}
.um:hover {
  background: var(--bg-sunken);
  color: var(--text);
}
.um b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.um__bar {
  position: relative;
  width: 36px;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--line);
}
.um__bar i {
  position: absolute;
  inset: 0;
  background: var(--ink);
  transform-origin: left;
  transition: transform 0.4s var(--ease);
}
.um.is-low .um__bar i {
  background: var(--danger);
}
.um--off {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--ink-text);
}
.um--off:hover {
  background: var(--ink);
  color: var(--ink-text);
  opacity: 0.88;
}
@media (max-width: 520px) {
  .um__long,
  .um__bar {
    display: none;
  }
}
</style>
