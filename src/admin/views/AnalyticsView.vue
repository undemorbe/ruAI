<script setup lang="ts">
import { computed, ref } from 'vue'
import { adminApi } from '../api'
import { num, pct, rub } from '../format'
import { range, useReport } from '../state'
import CalendarHeat from '../ui/CalendarHeat.vue'
import Panel from '../ui/Panel.vue'
import Stat from '../ui/Stat.vue'

const { data: a, error, loading } = useReport((r) => adminApi.analytics(r))

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const wdMetric = ref<'requests' | 'revenueRub' | 'registrations'>('requests')
const wdMax = computed(() => Math.max(1, ...(a.value?.weekday.map((w) => w[wdMetric.value]) ?? [])))
const wdFmt = (v: number) => (wdMetric.value === 'revenueRub' ? rub(v) : num(v))

const funnel = computed(() => {
  const f = a.value?.funnel
  if (!f) return []
  // «от шага» - только там, где шаг вложен в родителя: оплатить можно и без запросов
  const steps = [
    { label: 'Зарегистрировались', n: f.registered, parent: null as number | null, of: '' },
    { label: 'Делали запросы', n: f.active, parent: null, of: '' },
    { label: 'Оплатили', n: f.paid, parent: null, of: '' },
    { label: 'Оплатили повторно', n: f.repeat, parent: f.paid, of: 'от оплативших' },
  ]
  return steps.map((s) => ({ ...s, ofAll: f.registered ? (s.n / f.registered) * 100 : 0, step: s.parent ? (s.n / s.parent) * 100 : null }))
})

/** Линии активности: активные за день и регистрации. */
const W = 720
const H = 150
const trend = computed(() => {
  const d = a.value?.days ?? []
  const max = Math.max(1, ...d.map((x) => Math.max(x.activeUsers, x.registrations)))
  const x = (i: number) => (d.length > 1 ? (i / (d.length - 1)) * W : W / 2)
  const y = (v: number) => H - (v / max) * (H - 10) - 2
  const line = (k: 'activeUsers' | 'registrations') => d.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')
  return { max, dau: line('activeUsers'), reg: line('registrations'), area: d.length ? `0,${H} ${line('activeUsers')} ${W},${H}` : '' }
})
const dm = (s?: string) => (s ? s.slice(5).split('-').reverse().join('.') : '')

/** Цвет ячейки когорты: чем выше удержание, тем насыщеннее. */
const cell = (v: number | null) => (v === null ? {} : { '--lv': `${Math.round(8 + Math.min(100, v) * 0.82)}%` })
</script>

<template>
  <p v-if="error" class="err-box">{{ error }}</p>
  <div v-else-if="a" class="stack" :class="{ 'is-loading': loading }">
    <div class="grid-stats">
      <Stat label="Активные пользователи" :value="num(a.activity.activeUsers)" sub="хотя бы один запрос" />
      <Stat label="Средний DAU" :value="num(a.activity.avgDau)" :sub="`пик ${num(a.activity.peakDau)}${a.activity.peakDate ? ` · ${dm(a.activity.peakDate)}` : ''}`" />
      <Stat label="Вовлечённость" :value="pct(a.activity.stickiness)" sub="DAU / активные за период" />
      <Stat label="Запросов на активного" :value="num(a.activity.requestsPerActive)" />
      <Stat label="LTV платящего" :value="rub(a.payback.ltvRub)" :sub="`${num(a.payback.payingUsers)} платящих за всё время`" />
      <Stat label="До первой оплаты" :value="a.payback.medianDaysToPay === null ? 'нет данных' : `${a.payback.medianDaysToPay.toLocaleString('ru-RU')} дн.`" sub="медиана, новые в периоде" />
    </div>

    <Panel title="Календарь" note="каждый день периода по выбранному показателю">
      <CalendarHeat :days="a.days" :range="range" @select="range = $event" />
    </Panel>

    <Panel title="Активность по дням">
      <div class="tr__legend">
        <span><i class="k k--dau"></i>Активные за день</span>
        <span><i class="k k--reg"></i>Регистрации</span>
        <span class="muted tr__max">макс. {{ num(trend.max) }}</span>
      </div>
      <svg class="tr" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" aria-label="Активные пользователи и регистрации по дням">
        <polygon :points="trend.area" class="tr__area" />
        <polyline :points="trend.dau" class="tr__dau" />
        <polyline :points="trend.reg" class="tr__reg" />
      </svg>
      <div class="tr__ends">
        <span>{{ dm(a.days[0]?.date) }}</span>
        <span>{{ dm(a.days.at(-1)?.date) }}</span>
      </div>
    </Panel>

    <div class="grid-2">
      <Panel title="Воронка" note="кто зарегистрировался в периоде">
        <ol class="fn">
          <li v-for="s in funnel" :key="s.label">
            <div class="fn__top">
              <span>{{ s.label }}</span>
              <strong>{{ num(s.n) }}</strong>
            </div>
            <div class="fn__bar"><i :style="{ width: `${Math.max(s.ofAll, s.n ? 1.5 : 0)}%` }"></i></div>
            <div class="fn__sub muted">
              {{ pct(s.ofAll) }} от регистраций<template v-if="s.step !== null"> · {{ pct(s.step) }} {{ s.of }}</template>
            </div>
          </li>
        </ol>
      </Panel>

      <Panel title="Дни недели" note="в среднем за день">
        <template #aside>
          <select v-model="wdMetric" class="field-sm wd__sel" aria-label="Показатель">
            <option value="requests">Запросы</option>
            <option value="revenueRub">Выручка</option>
            <option value="registrations">Регистрации</option>
          </select>
        </template>
        <div class="wd">
          <div v-for="w in a.weekday" :key="w.day" class="wd__col">
            <span class="wd__v">{{ wdFmt(w[wdMetric]) }}</span>
            <div class="wd__track"><i :class="{ 'is-we': w.day > 4 }" :style="{ height: `${(w[wdMetric] / wdMax) * 100}%` }"></i></div>
            <span class="wd__d" :class="{ bad: w.day > 4 }">{{ WD[w.day] }}</span>
          </div>
        </div>
      </Panel>
    </div>

    <Panel title="Удержание когорт" :note="a.cohorts.unit === 'week' ? 'по неделе регистрации: доля активных в неделю N' : 'по месяцу регистрации: доля активных в месяц N'">
      <p v-if="!a.cohorts.rows.length" class="muted">Нет регистраций в периоде.</p>
      <div v-else class="scroll-x">
        <table class="tbl coh">
          <thead>
            <tr>
              <th>{{ a.cohorts.unit === 'week' ? 'Неделя' : 'Месяц' }}</th>
              <th class="r">Людей</th>
              <th class="r">Купили</th>
              <th v-for="k in a.cohorts.rows[0]!.retention.length" :key="k" class="r">{{ a.cohorts.unit === 'week' ? 'Н' : 'М' }}{{ k - 1 }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in a.cohorts.rows" :key="c.start">
              <td>{{ c.label }}</td>
              <td class="r">{{ num(c.size) }}</td>
              <td class="r">{{ c.size ? pct(c.paidPct) : '-' }}</td>
              <td v-for="(v, k) in c.retention" :key="k" class="r coh__c" :class="{ 'is-null': v === null || !c.size }" :style="c.size ? cell(v) : {}">
                {{ v === null || !c.size ? '' : `${Math.round(v)}%` }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  </div>
</template>

<style scoped>
.is-loading {
  opacity: 0.6;
  transition: opacity 0.15s;
}
.tr__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 8px;
  color: var(--text-2);
  font-size: 12.5px;
}
.tr__max {
  margin-left: auto;
}
.k {
  display: inline-block;
  width: 10px;
  height: 3px;
  margin-right: 6px;
  border-radius: 2px;
  vertical-align: 3px;
}
.k--dau {
  background: var(--accent);
}
.k--reg {
  background: var(--ink);
}
.tr {
  display: block;
  width: 100%;
  height: 160px;
}
.tr__area {
  fill: color-mix(in srgb, var(--accent) 10%, transparent);
}
.tr__dau,
.tr__reg {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.tr__dau {
  stroke: var(--accent);
}
.tr__reg {
  stroke: var(--ink);
  stroke-dasharray: 4 3;
}
.tr__ends {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.fn {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.fn__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.fn__bar {
  height: 10px;
  margin: 6px 0 4px;
  border-radius: 5px;
  background: var(--bg-sunken);
}
.fn__bar i {
  display: block;
  height: 100%;
  border-radius: 5px;
  background: var(--ink);
}
.fn li:nth-child(n + 3) .fn__bar i {
  background: var(--accent);
}
.fn__sub {
  font-size: 12.5px;
}
.wd__sel {
  width: auto;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 13px;
}
.wd {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  height: 200px;
}
.wd__col {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 6px;
  min-width: 0;
  text-align: center;
}
.wd__v {
  overflow: hidden;
  color: var(--text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wd__track {
  display: flex;
  align-items: flex-end;
  border-radius: 6px;
  background: var(--bg-sunken);
}
.wd__track i {
  width: 100%;
  min-height: 2px;
  border-radius: 6px;
  background: var(--ink);
}
.wd__track i.is-we {
  background: var(--accent);
}
.wd__d {
  font-size: 12.5px;
}
.coh td {
  padding: 7px 8px;
}
.coh__c {
  background: color-mix(in srgb, var(--accent) var(--lv, 0%), transparent);
  font-size: 12.5px;
}
.coh__c.is-null {
  background: transparent;
}
</style>
