<script setup lang="ts">
import { adminApi } from '../api'
import { num, pct, PLAN_LABEL, rub, TIER_SHORT } from '../format'
import { useReport } from '../state'
import DailyChart from '../ui/DailyChart.vue'
import Panel from '../ui/Panel.vue'
import Stat from '../ui/Stat.vue'

const { data: f, error } = useReport((d) => adminApi.finance(d))
</script>

<template>
  <p v-if="error" class="err-box">{{ error }}</p>
  <div v-else-if="f" class="stack">
    <div class="grid-stats">
      <Stat label="Выручка" :value="rub(f.revenueRub)" sub="за вычетом возвратов" />
      <Stat label="Расход API" :value="rub(f.apiRub)" />
      <Stat label="Валовая прибыль" :value="rub(f.grossRub)" :tone="f.grossRub < 0 ? 'bad' : undefined" sub="выручка − API" />
      <Stat label="Маржа" :value="pct(f.marginPct)" :tone="f.marginPct < 40 ? 'bad' : 'good'" />
      <Stat label="Средний чек" :value="rub(f.avgCheckRub)" />
      <Stat label="ARPU" :value="rub(f.arpuRub)" :sub="`${num(f.payingUsers)} платящих`" />
      <Stat label="Возвраты" :value="rub(f.refundsRub)" />
    </div>
    <Panel title="Выручка и расход по дням">
      <DailyChart :points="f.series" />
    </Panel>
    <Panel title="Маржа по тарифам" note="без эквайринга и налогов">
      <div class="scroll-x">
        <table class="tbl">
          <thead><tr><th>Тариф</th><th>Период</th><th class="r">Выручка</th><th class="r">Расход API</th><th class="r">Маржа</th></tr></thead>
          <tbody>
            <tr v-for="x in f.byPlan" :key="x.tier + x.planId">
              <td><span class="tag" :class="{ 'tag--media': x.tier === 'media' }">{{ TIER_SHORT[x.tier] }}</span></td>
              <td>{{ PLAN_LABEL[x.planId] }}</td>
              <td class="r">{{ rub(x.revenueRub) }}</td>
              <td class="r">{{ rub(x.apiRub) }}</td>
              <td class="r" :class="x.revenueRub && x.marginPct < 40 ? 'bad' : ''">{{ x.revenueRub ? pct(x.marginPct) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  </div>
</template>
