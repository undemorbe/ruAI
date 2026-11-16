<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DayStats } from '../api'
import { num, rub } from '../format'
import { monthCells, monthsOf, parseDay, spanOf, type DateRange } from '../range'

/**
 * Календарь-тепловая карта: каждый день периода окрашен по выбранному показателю.
 * Щелчок по двум дням сужает период отчётов до этого диапазона.
 */
const props = defineProps<{ days: DayStats[]; range: DateRange }>()
const emit = defineEmits<{ select: [r: DateRange] }>()

const METRICS = [
  { id: 'revenueRub', label: 'Выручка', fmt: rub },
  { id: 'requests', label: 'Запросы', fmt: num },
  { id: 'activeUsers', label: 'Активные', fmt: num },
  { id: 'registrations', label: 'Регистрации', fmt: num },
  { id: 'apiRub', label: 'Расход API', fmt: rub },
  { id: 'generations', label: 'Генерации', fmt: num },
] as const
type Metric = (typeof METRICS)[number]['id']
const metric = ref<Metric>('revenueRub')
const m = computed(() => METRICS.find((x) => x.id === metric.value)!)

const byDay = computed(() => new Map(props.days.map((d) => [parseDay(d.date)!, d])))
const max = computed(() => Math.max(1, ...props.days.map((d) => d[metric.value])))
const total = computed(() => props.days.reduce((n, d) => n + d[metric.value], 0))
const months = computed(() =>
  monthsOf(props.range).map(({ year, month }) => ({
    key: `${year}-${month}`,
    title: new Date(Date.UTC(year, month, 1)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    weeks: monthCells(year, month),
  })),
)

/** Доля от максимума: 0 - пусто, иначе от 12 до 100 % насыщенности. */
const level = (v: number) => (v <= 0 ? 0 : Math.round(12 + (v / max.value) * 88))

const anchor = ref<number | null>(null)
const focus = ref<number | null>(null)
const tip = computed(() => {
  const d = focus.value === null ? null : byDay.value.get(focus.value)
  return d ? `${new Date(focus.value!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' })}: ${m.value.fmt(d[metric.value])}` : null
})

function click(ms: number) {
  if (!byDay.value.has(ms)) return
  if (anchor.value === null) {
    anchor.value = ms
    return
  }
  emit('select', spanOf(anchor.value, ms))
  anchor.value = null
}
const between = (ms: number) => anchor.value !== null && focus.value !== null && ms >= Math.min(anchor.value, focus.value) && ms <= Math.max(anchor.value, focus.value)
</script>

<template>
  <div class="ch">
    <div class="ch__bar">
      <div class="ch__metrics" role="radiogroup" aria-label="Показатель">
        <button v-for="x in METRICS" :key="x.id" role="radio" :aria-checked="metric === x.id" @click="metric = x.id">{{ x.label }}</button>
      </div>
      <span class="ch__tip" aria-live="polite">{{ tip ?? (anchor !== null ? 'Выберите второй день' : `Всего: ${m.fmt(total)}`) }}</span>
    </div>

    <div class="ch__months">
      <section v-for="mo in months" :key="mo.key" class="ch__month">
        <h3>{{ mo.title }}</h3>
        <div class="ch__grid">
          <span v-for="w in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="w" class="ch__wd" aria-hidden="true">{{ w }}</span>
          <template v-for="(week, wi) in mo.weeks" :key="wi">
            <template v-for="(d, di) in week" :key="`${wi}-${di}`">
              <span v-if="d === null" class="ch__pad"></span>
              <button
                v-else-if="byDay.has(d)"
                class="ch__day"
                :class="{ 'is-anchor': anchor === d, 'is-between': between(d), 'is-empty': !level(byDay.get(d)![metric]) }"
                :style="{ '--lv': `${level(byDay.get(d)![metric])}%` }"
                :aria-label="`${new Date(d).getUTCDate()}: ${m.fmt(byDay.get(d)![metric])}`"
                @click="click(d)"
                @mouseenter="focus = d"
                @focus="focus = d"
                @mouseleave="focus = null"
              >
                <span class="ch__n">{{ new Date(d).getUTCDate() }}</span>
              </button>
              <span v-else class="ch__out">{{ new Date(d).getUTCDate() }}</span>
            </template>
          </template>
        </div>
      </section>
    </div>

    <div class="ch__legend" aria-hidden="true">
      <span>меньше</span>
      <i v-for="k in [12, 34, 56, 78, 100]" :key="k" :style="{ '--lv': `${k}%` }"></i>
      <span>больше · макс. {{ m.fmt(max === 1 && !total ? 0 : max) }}</span>
      <span class="ch__hint">Два щелчка по дням: показать этот диапазон</span>
    </div>
  </div>
</template>

<style scoped>
.ch__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-bottom: 14px;
}
.ch__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ch__metrics button {
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--text-2);
  font-size: 13px;
}
.ch__metrics button[aria-checked='true'] {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--ink-text);
}
.ch__tip {
  margin-left: auto;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.ch__months {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
  gap: 18px 22px;
}
.ch__month h3 {
  margin: 0 0 8px;
  font-weight: 600;
  font-size: 13.5px;
}
.ch__month h3::first-letter {
  text-transform: uppercase;
}
.ch__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
}
.ch__wd {
  color: var(--text-3);
  font-size: 11px;
  text-align: center;
}
.ch__day,
.ch__out,
.ch__pad {
  aspect-ratio: 1;
}
.ch__day {
  position: relative;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) var(--lv), var(--bg-sunken));
  color: var(--text);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  transition: transform 0.1s var(--ease);
}
.ch__day.is-empty {
  background: var(--bg-sunken);
  color: var(--text-3);
}
.ch__day:hover {
  transform: scale(1.08);
  z-index: 1;
}
.ch__day.is-between {
  outline: 2px solid color-mix(in srgb, var(--ink) 35%, transparent);
  outline-offset: -2px;
}
.ch__day.is-anchor {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
}
.ch__n {
  position: absolute;
  top: 3px;
  left: 5px;
}
.ch__out {
  display: block;
  padding: 3px 5px;
  color: var(--text-3);
  font-size: 11.5px;
  opacity: 0.4;
}
.ch__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin-top: 14px;
  color: var(--text-3);
  font-size: 12px;
}
.ch__legend i {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) var(--lv), var(--bg-sunken));
}
.ch__hint {
  margin-left: auto;
}
@media (max-width: 520px) {
  .ch__tip,
  .ch__hint {
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
