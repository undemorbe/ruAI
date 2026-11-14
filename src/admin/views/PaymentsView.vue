<script setup lang="ts">
import { computed } from 'vue'
import { adminApi } from '../api'
import { date, num, PLAN_LABEL, rub, TIER_SHORT } from '../format'
import { useReport } from '../state'
import Panel from '../ui/Panel.vue'
import Stat from '../ui/Stat.vue'

const { data: p, error } = useReport((d) => adminApi.payments(d))
const total = computed(() => p.value?.byPlan.reduce((n, x) => ({ count: n.count + x.count, rev: n.rev + x.revenueRub }), { count: 0, rev: 0 }))
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000))
</script>

<template>
  <p v-if="error" class="err-box">{{ error }}</p>
  <div v-else-if="p" class="stack">
    <div class="grid-stats">
      <Stat label="Успешные платежи" :value="num(p.succeeded.count)" :sub="rub(p.succeeded.revenueRub)" />
      <Stat label="Первые оплаты" :value="num(p.first.count)" :sub="rub(p.first.revenueRub)" />
      <Stat label="Повторные оплаты" :value="num(p.repeat.count)" :sub="rub(p.repeat.revenueRub)" />
      <Stat label="Неуспешные" :value="num(p.failed.count)" :sub="`на ${rub(p.failed.amountRub)}`" :tone="p.failed.count ? 'bad' : undefined" />
      <Stat label="Возвраты" :value="num(p.refunds.count)" :sub="rub(p.refunds.amountRub)" />
    </div>

    <Panel title="Продажи по тарифам">
      <div class="scroll-x">
        <table class="tbl">
          <thead>
            <tr><th>Тариф</th><th>Период</th><th class="r">Цена</th><th class="r">Продаж</th><th class="r">Выручка</th><th>Доля</th></tr>
          </thead>
          <tbody>
            <tr v-for="x in p.byPlan" :key="x.tier + x.planId">
              <td><span class="tag" :class="{ 'tag--media': x.tier === 'media' }">{{ TIER_SHORT[x.tier] }}</span></td>
              <td>{{ PLAN_LABEL[x.planId] }}</td>
              <td class="r">{{ rub(x.price) }}</td>
              <td class="r">{{ num(x.count) }}</td>
              <td class="r">{{ rub(x.revenueRub) }}</td>
              <td><div class="bar"><i :style="{ width: `${total?.rev ? (x.revenueRub / total.rev) * 100 : 0}%` }"></i></div></td>
            </tr>
          </tbody>
          <tfoot v-if="total">
            <tr><td colspan="3">Итого</td><td class="r">{{ num(total.count) }}</td><td class="r">{{ rub(total.rev) }}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
    </Panel>

    <Panel title="Скоро заканчиваются" note="ближайшие 14 дней">
      <p v-if="!p.expiring.length" class="muted">Нет подписок, которые заканчиваются в ближайшие две недели.</p>
      <div v-else class="scroll-x">
        <table class="tbl">
          <thead>
            <tr><th>Пользователь</th><th>Тариф</th><th>Окончание</th><th class="r">Осталось</th><th>Автопродление</th></tr>
          </thead>
          <tbody>
            <tr v-for="x in p.expiring" :key="x.userId">
              <td>{{ x.email }}</td>
              <td><span class="tag" :class="{ 'tag--media': x.tier === 'media' }">{{ TIER_SHORT[x.tier] }}</span> {{ PLAN_LABEL[x.planId] }}</td>
              <td>{{ date(x.expiresAt) }}</td>
              <td class="r">{{ daysLeft(x.expiresAt) }} дн</td>
              <td :class="x.autoRenew ? 'good' : 'muted'">{{ x.autoRenew ? 'включено' : 'нет' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  </div>
</template>
