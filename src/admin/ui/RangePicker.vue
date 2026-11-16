<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { checkRange, DAY, dayStart, isoDay, MAX_BACK_DAYS, MAX_RANGE_DAYS, monthCells, parseDay, PRESETS, presetOf, rangeLabel, spanOf, type DateRange } from '../range'

/**
 * Выбор периода отчётов: быстрые пресеты и календарь на два месяца.
 * Первый щелчок по дню - начало, второй - конец; можно ввести даты руками.
 */
const model = defineModel<DateRange>({ required: true })

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const today = () => dayStart(Date.now())

const draft = ref<DateRange>({ ...model.value })
const anchor = ref<number | null>(null)
const hover = ref<number | null>(null)
const error = ref<string | null>(null)
/** Правый из двух показанных месяцев. */
const view = ref({ year: 0, month: 0 })

function showMonthOf(ms: number) {
  const d = new Date(ms)
  view.value = { year: d.getUTCFullYear(), month: d.getUTCMonth() }
}

function toggle() {
  if (open.value) return close()
  draft.value = { ...model.value }
  anchor.value = null
  error.value = null
  showMonthOf(parseDay(model.value.to)!)
  open.value = true
  nextTick(() => panel.value?.querySelector<HTMLElement>('[aria-pressed="true"], .rp__day:not(:disabled)')?.focus())
}
function close() {
  open.value = false
}

const months = computed(() => {
  const { year, month } = view.value
  return [-1, 0].map((k) => {
    const d = new Date(Date.UTC(year, month + k, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    return { key: `${y}-${m}`, title: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }), weeks: monthCells(y, m) }
  })
})
const shift = (k: number) => {
  const d = new Date(Date.UTC(view.value.year, view.value.month + k, 1))
  view.value = { year: d.getUTCFullYear(), month: d.getUTCMonth() }
}
const canNext = computed(() => Date.UTC(view.value.year, view.value.month + 1, 1) <= today())

/** Выбранный (или предварительный, пока выбирают конец) диапазон в мс. */
const shown = computed(() => {
  if (anchor.value !== null) {
    const b = hover.value ?? anchor.value
    return { a: Math.min(anchor.value, b), b: Math.max(anchor.value, b) }
  }
  return { a: parseDay(draft.value.from)!, b: parseDay(draft.value.to)! }
})

function disabled(ms: number) {
  if (ms > today() || ms < today() - MAX_BACK_DAYS * DAY) return true
  // второй щелчок: не дальше максимальной длины от начала
  return anchor.value !== null && Math.abs(ms - anchor.value) >= MAX_RANGE_DAYS * DAY
}

function pick(ms: number) {
  error.value = null
  if (anchor.value === null) {
    anchor.value = ms
    draft.value = { from: isoDay(ms), to: isoDay(ms) }
    return
  }
  draft.value = spanOf(anchor.value, ms)
  anchor.value = null
  hover.value = null
}

function preset(id: string) {
  const p = PRESETS.find((x) => x.id === id)!
  model.value = p.range()
  close()
}

function apply() {
  const r = checkRange(draft.value.from, draft.value.to)
  if (typeof r === 'string') {
    error.value = r
    return
  }
  model.value = r
  close()
}

/** Ввод дат вручную (поля type=date отдают YYYY-MM-DD). */
function typed(which: 'from' | 'to', v: string) {
  anchor.value = null
  draft.value = { ...draft.value, [which]: v }
  const ms = parseDay(v)
  if (ms !== null) showMonthOf(which === 'from' ? Math.min(ms + 31 * DAY, today()) : ms)
}

/** Стрелки двигают фокус по дням, как в обычном календаре. */
function key(e: KeyboardEvent, ms: number) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
  if (!step) return
  e.preventDefault()
  const next = ms + step * DAY
  if (next > today()) return
  const d = new Date(next)
  // ушли за левый месяц: он становится левым; за правый: правым
  if (next < Date.UTC(view.value.year, view.value.month - 1, 1)) showMonthOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  else if (next >= Date.UTC(view.value.year, view.value.month + 1, 1)) showMonthOf(next)
  nextTick(() => panel.value?.querySelector<HTMLElement>(`[data-day="${isoDay(next)}"]`)?.focus())
}

const label = computed(() => rangeLabel(model.value))
const active = computed(() => presetOf(model.value))
const days = computed(() => Math.round((shown.value.b - shown.value.a) / DAY) + 1)
const fmt = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })

function outside(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) close()
}
function esc(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') close()
}
watch(open, (o) => {
  if (o) {
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
  } else {
    document.removeEventListener('pointerdown', outside)
    document.removeEventListener('keydown', esc)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', esc)
})
</script>

<template>
  <div ref="root" class="rp">
    <div class="rp__quick" role="group" aria-label="Быстрый выбор периода">
      <button v-for="p in PRESETS.filter((x) => ['7', '30', '90'].includes(x.id))" :key="p.id" :aria-pressed="active === p.id" @click="preset(p.id)">{{ p.label }}</button>
    </div>
    <button class="rp__trigger" :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>
      <span>{{ label }}</span>
    </button>

    <div v-if="open" ref="panel" class="rp__panel" role="dialog" aria-label="Период отчётов">
      <ul class="rp__presets">
        <li v-for="p in PRESETS" :key="p.id">
          <button :aria-pressed="active === p.id" @click="preset(p.id)">{{ p.label }}</button>
        </li>
      </ul>

      <div class="rp__main">
        <div class="rp__nav">
          <button class="rp__arrow" aria-label="Раньше" @click="shift(-1)">‹</button>
          <button class="rp__arrow" aria-label="Позже" :disabled="!canNext" @click="shift(1)">›</button>
        </div>
        <div class="rp__months">
          <div v-for="(m, mi) in months" :key="m.key" class="rp__month" :class="{ 'rp__month--first': mi === 0 }">
            <div class="rp__title">{{ m.title }}</div>
            <div class="rp__grid" role="grid" :aria-label="m.title">
              <span v-for="w in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="w" class="rp__wd" aria-hidden="true">{{ w }}</span>
              <template v-for="(week, wi) in m.weeks" :key="wi">
                <template v-for="(d, di) in week" :key="`${wi}-${di}`">
                  <span v-if="d === null" class="rp__pad"></span>
                  <button
                    v-else
                    class="rp__day"
                    :data-day="isoDay(d)"
                    :class="{
                      'is-in': d >= shown.a && d <= shown.b,
                      'is-a': d === shown.a,
                      'is-b': d === shown.b,
                      'is-today': d === today(),
                    }"
                    :aria-pressed="d >= shown.a && d <= shown.b"
                    :aria-label="fmt(d)"
                    :disabled="disabled(d)"
                    @click="pick(d)"
                    @mouseenter="hover = d"
                    @focus="hover = d"
                    @keydown="key($event, d)"
                  >
                    {{ new Date(d).getUTCDate() }}
                  </button>
                </template>
              </template>
            </div>
          </div>
        </div>

        <div class="rp__foot">
          <label>
            <span class="muted">С</span>
            <input class="field-sm" type="date" :value="draft.from" :max="isoDay(today())" @change="typed('from', ($event.target as HTMLInputElement).value)" />
          </label>
          <label>
            <span class="muted">по</span>
            <input class="field-sm" type="date" :value="draft.to" :max="isoDay(today())" @change="typed('to', ($event.target as HTMLInputElement).value)" />
          </label>
          <span class="muted rp__len">{{ anchor !== null ? 'выберите конец' : `${days} дн.` }}</span>
          <p v-if="error" class="bad rp__err" role="alert">{{ error }}</p>
          <div class="rp__act">
            <button class="btn btn--ghost" @click="close">Отмена</button>
            <button class="btn btn--ink" :disabled="anchor !== null" @click="apply">Показать</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rp {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.rp__quick {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
}
.rp__quick button {
  min-height: 34px;
  padding: 0 11px;
  border-radius: 7px;
  color: var(--text-2);
  font-size: 13.5px;
}
.rp__quick button[aria-pressed='true'] {
  background: var(--ink);
  color: var(--ink-text);
}
.rp__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--bg-elev);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.rp__trigger:hover,
.rp__trigger[aria-expanded='true'] {
  border-color: var(--text-2);
}
.rp__trigger svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
}
.rp__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  width: min(720px, calc(100vw - 32px));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-elev);
  box-shadow: var(--shadow);
  animation: rp-in 0.16s var(--ease);
}
@keyframes rp-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
.rp__presets {
  display: grid;
  align-content: start;
  gap: 2px;
  margin: 0;
  padding: 12px 8px;
  border-right: 1px solid var(--line);
  list-style: none;
}
.rp__presets button {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 13.5px;
  text-align: left;
}
.rp__presets button:hover {
  background: var(--bg-sunken);
  color: var(--text);
}
.rp__presets button[aria-pressed='true'] {
  background: var(--bg-sunken);
  color: var(--text);
  font-weight: 600;
}
.rp__main {
  position: relative;
  min-width: 0;
  padding: 14px 16px 16px;
}
.rp__nav {
  position: absolute;
  top: 10px;
  right: 12px;
  left: 12px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.rp__arrow {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 20px;
  line-height: 1;
  pointer-events: auto;
}
.rp__arrow:hover:not(:disabled) {
  background: var(--bg-sunken);
}
.rp__arrow:disabled {
  opacity: 0.3;
}
.rp__months {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.rp__title {
  margin: 6px 0 10px;
  font-weight: 600;
  font-size: 14px;
  text-align: center;
}
.rp__title::first-letter {
  text-transform: uppercase;
}
.rp__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  row-gap: 2px;
}
.rp__wd {
  padding-bottom: 4px;
  color: var(--text-3);
  font-size: 11.5px;
  text-align: center;
}
.rp__day {
  position: relative;
  height: 34px;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.rp__day:hover:not(:disabled) {
  background: var(--bg-sunken);
  border-radius: 8px;
}
.rp__day:disabled {
  color: var(--text-3);
  opacity: 0.45;
}
.rp__day.is-in {
  background: color-mix(in srgb, var(--accent) 13%, transparent);
  border-radius: 0;
}
.rp__day.is-a,
.rp__day.is-b {
  background: var(--ink);
  color: var(--ink-text);
}
.rp__day.is-a {
  border-radius: 8px 0 0 8px;
}
.rp__day.is-b {
  border-radius: 0 8px 8px 0;
}
.rp__day.is-a.is-b {
  border-radius: 8px;
}
.rp__day.is-today::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 50%;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 50%;
  background: var(--accent);
}
.rp__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.rp__foot label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
}
.rp__foot .field-sm {
  width: 150px;
}
.rp__len {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.rp__err {
  flex-basis: 100%;
  margin: 0;
  font-size: 13.5px;
}
.rp__act {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.rp__act .btn {
  min-height: 38px;
  padding: 0 16px;
  font-size: 14px;
}

@media (max-width: 720px) {
  .rp__panel {
    position: fixed;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    grid-template-columns: minmax(0, 1fr);
    width: auto;
    max-height: 88dvh;
    overflow-y: auto;
    padding-bottom: env(safe-area-inset-bottom);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .rp__presets {
    display: flex;
    gap: 6px;
    padding: 12px 12px 10px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .rp__presets button {
    padding: 7px 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    white-space: nowrap;
  }
  .rp__months {
    grid-template-columns: minmax(0, 1fr);
  }
  .rp__month--first {
    display: none;
  }
  .rp__day {
    height: 40px;
  }
  .rp__foot .field-sm {
    width: 100%;
  }
  .rp__foot label {
    flex: 1 1 140px;
  }
  .rp__act {
    width: 100%;
  }
  .rp__act .btn {
    flex: 1;
  }
}
</style>
