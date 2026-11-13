<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { LimitCode } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import { nextMskMidnight } from '@/lib/limits'

/** Диалог при отказе по лимитам: нет подписки, закончился период или суточный лимит. */
const props = defineProps<{ code: LimitCode }>()
const emit = defineEmits<{ close: [] }>()

function untilReset() {
  const min = Math.max(1, Math.round((nextMskMidnight(new Date()).getTime() - Date.now()) / 60_000))
  const h = Math.floor(min / 60)
  return h ? `${h} ч ${min % 60} мин` : `${min} мин`
}

const copy = computed(() => {
  switch (props.code) {
    case 'daily_limit':
      return {
        title: 'На сегодня запросы закончились',
        text: `Суточный лимит обновится в 00:00 по Москве — через ${untilReset()}. Остаток за период никуда не денется.`,
        pay: false,
      }
    case 'total_limit':
    case 'budget':
      return {
        title: 'Запросы периода закончились',
        text: 'Оплатите новый период — счётчик обнулится сразу после оплаты. Все чаты и история остаются на месте.',
        pay: true,
      }
    default:
      return {
        title: 'Нужна подписка',
        text: 'Запросы к GPT-OSS-20B доступны по подписке — от 388 ₽ за 7 дней. История чатов сохраняется и после окончания подписки.',
        pay: true,
      }
  }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="pw" role="dialog" aria-modal="true" :aria-label="copy.title" @click.self="emit('close')">
    <div class="pw__card">
      <button class="pw__x" aria-label="Закрыть" @click="emit('close')"><Icon name="x" /></button>
      <span class="pw__badge"><Icon name="bolt" :size="22" /></span>
      <h2>{{ copy.title }}</h2>
      <p>{{ copy.text }}</p>
      <template v-if="copy.pay">
        <RouterLink to="/pricing" class="btn btn--ink btn--block">Выбрать период</RouterLink>
        <button class="btn btn--block pw__later" @click="emit('close')">Позже</button>
      </template>
      <button v-else class="btn btn--ink btn--block" @click="emit('close')">Понятно</button>
    </div>
  </div>
</template>

<style scoped>
.pw {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(10 10 14 / 0.5);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  animation: fade 0.2s;
}
.pw__card {
  position: relative;
  width: min(400px, 100%);
  padding: 28px 24px 18px;
  border-radius: var(--radius-l);
  background: var(--bg-elev);
  box-shadow: var(--shadow);
  text-align: center;
  animation: up 0.3s var(--ease);
}
.pw__x {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 6px;
  color: var(--text-3);
}
.pw__badge {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--ink);
  color: var(--ink-text);
}
h2 {
  margin: 16px 0 8px;
  font: 600 20px/1.25 var(--font-display);
}
p {
  margin: 0 0 22px;
  color: var(--text-2);
}
.pw__later {
  margin-top: 6px;
  color: var(--text-2);
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes up {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
}
</style>
