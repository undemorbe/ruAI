<script setup lang="ts">
import { adminApi } from '../api'
import { num, rub, usd } from '../format'
import { useReport } from '../state'
import DailyChart from '../ui/DailyChart.vue'
import Panel from '../ui/Panel.vue'
import Stat from '../ui/Stat.vue'

const { data: o, error } = useReport((r) => adminApi.overview(r))
</script>

<template>
  <p v-if="error" class="err-box">{{ error }}</p>
  <div v-else-if="o" class="stack">
    <div class="grid-stats">
      <Stat label="Выручка" :value="rub(o.revenueRub)" sub="за вычетом возвратов" :cur="o.revenueRub" :prev="o.compare.revenueRub" />
      <Stat label="Расход OpenRouter" :value="rub(o.openrouterRub)" :sub="usd(o.openrouterUsd)" :cur="o.openrouterRub" :prev="o.compare.openrouterRub" lower-is-better />
      <Stat label="Регистрации" :value="num(o.registrations)" :cur="o.registrations" :prev="o.compare.registrations" />
      <Stat label="Активные пользователи" :value="num(o.activeUsers)" sub="делали запросы" :cur="o.activeUsers" :prev="o.compare.activeUsers" />
      <Stat label="Запросы" :value="num(o.requests)" :cur="o.requests" :prev="o.compare.requests" />
      <Stat label="Новые подписки" :value="num(o.newSubscriptions)" sub="первая оплата" :cur="o.newSubscriptions" :prev="o.compare.newSubscriptions" />
      <Stat label="Активные подписки" :value="num(o.activeSubscriptions)" sub="на конец периода" :cur="o.activeSubscriptions" :prev="o.compare.activeSubscriptions" />
      <Stat label="Продления" :value="num(o.renewals)" :cur="o.renewals" :prev="o.compare.renewals" />
      <Stat
        label="Отмены"
        :value="num(o.cancellations)"
        sub="не продлили после окончания"
        :tone="o.cancellations > o.renewals ? 'bad' : undefined"
        :cur="o.cancellations"
        :prev="o.compare.cancellations"
        lower-is-better
      />
    </div>
    <Panel title="Выручка и расход API по дням" note="изменения - к такому же периоду до этого">
      <DailyChart :points="o.series" />
    </Panel>
  </div>
</template>
