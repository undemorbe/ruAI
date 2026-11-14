<script setup lang="ts">
import type { PlanId, PlanTier } from '../api'
import { PRICES } from '@/content/plans'
import { PLAN_LABEL, TIER_SHORT } from '../format'
import Panel from '../ui/Panel.vue'
import { useSettings } from '../useSettings'

/** Внутренние бюджеты подписок и курс — пользователям не показываются. */
const st = useSettings()
const TIERS: PlanTier[] = ['text', 'media']
const PLANS: PlanId[] = ['week', 'month', 'quarter']
const share = (tier: PlanTier, id: PlanId) => Math.round(((st.draft.value?.budgetsRub[tier][id] ?? 0) / PRICES[tier][id]) * 100)
const setNum = (e: Event, fn: (n: number) => void) => fn(Number((e.target as HTMLInputElement).value))
</script>

<template>
  <form v-if="st.draft.value" class="stack" @submit.prevent="st.save">
    <Panel title="Внутренний бюджет подписки" note="максимум расхода OpenRouter на одну подписку; при исчерпании запросы закрываются">
      <div class="scroll-x">
        <table class="tbl">
          <thead><tr><th>Тариф</th><th>Период</th><th class="r">Цена</th><th>Бюджет, ₽</th><th class="r">Доля цены</th></tr></thead>
          <tbody>
            <template v-for="tier in TIERS" :key="tier">
              <tr v-for="id in PLANS" :key="tier + id">
                <td><span class="tag" :class="{ 'tag--media': tier === 'media' }">{{ TIER_SHORT[tier] }}</span></td>
                <td>{{ PLAN_LABEL[id] }}</td>
                <td class="r">{{ PRICES[tier][id] }} ₽</td>
                <td class="w-input">
                  <input
                    class="field-sm"
                    type="number"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    :aria-label="`Бюджет: ${TIER_SHORT[tier]}, ${PLAN_LABEL[id]}`"
                    :value="st.draft.value.budgetsRub[tier][id]"
                    @input="setNum($event, (n) => (st.draft.value!.budgetsRub[tier][id] = n))"
                  />
                </td>
                <td class="r" :class="{ bad: share(tier, id) > 60 }">{{ share(tier, id) }} %</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </Panel>

    <Panel title="Курс для пересчёта расходов">
      <label class="rate">
        <span>1 $ =</span>
        <input
          class="field-sm"
          type="number"
          min="1"
          step="0.01"
          inputmode="decimal"
          aria-label="Курс доллара в рублях"
          :value="st.draft.value.usdRub"
          @input="setNum($event, (n) => (st.draft.value!.usdRub = n))"
        />
        <span>₽</span>
      </label>
      <p class="muted">Расходы OpenRouter приходят в долларах; по этому курсу считаются бюджеты и отчёты в рублях.</p>
    </Panel>

    <p class="muted">Генерация изображений и её лимиты — в разделе <a href="#/images">«Изображения»</a>.</p>
    <p v-if="st.error.value" class="bad">{{ st.error.value }}</p>
    <div class="act">
      <button class="btn btn--ink" :disabled="!st.dirty.value || st.busy.value">{{ st.busy.value ? 'Сохраняем…' : 'Сохранить' }}</button>
      <button v-if="st.dirty.value" type="button" class="btn btn--ghost" @click="st.reset">Отменить</button>
      <span v-else-if="st.status.value" class="muted">{{ st.status.value }}</span>
    </div>
  </form>
  <p v-else-if="st.error.value" class="err-box">{{ st.error.value }}</p>
</template>

<style scoped>
.rate {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rate input {
  width: 110px;
}
.act {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.act .btn {
  min-height: 40px;
}
a {
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
