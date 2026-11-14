<script setup lang="ts">
import { adminApi } from '../api'
import { num, rub, usd } from '../format'
import { useReport } from '../state'
import DailyChart from '../ui/DailyChart.vue'
import Panel from '../ui/Panel.vue'
import Stat from '../ui/Stat.vue'

const { data: o, error } = useReport((d) => adminApi.overview(d))
</script>

<template>
  <p v-if="error" class="err-box">{{ error }}</p>
  <div v-else-if="o" class="stack">
    <div class="grid-stats">
      <Stat label="Выручка" :value="rub(o.revenueRub)" sub="за вычетом возвратов" />
      <Stat label="Расход OpenRouter" :value="rub(o.openrouterRub)" :sub="usd(o.openrouterUsd)" />
      <Stat label="Регистрации" :value="num(o.registrations)" />
      <Stat label="Новые подписки" :value="num(o.newSubscriptions)" sub="первая оплата" />
      <Stat label="Активные подписки" :value="num(o.activeSubscriptions)" sub="на сегодня" />
      <Stat label="Продления" :value="num(o.renewals)" />
      <Stat label="Отмены" :value="num(o.cancellations)" sub="не продлили после окончания" :tone="o.cancellations > o.renewals ? 'bad' : undefined" />
    </div>
    <Panel title="Выручка и расход API по дням">
      <DailyChart :points="o.series" />
    </Panel>
  </div>
</template>
