<script setup lang="ts">
import { computed } from 'vue'
import type { Plan } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import { fmt, pricePerRequest } from '@/content/plans'
import { formatPrice } from '@/lib/format'

const props = defineProps<{ plan: Plan }>()
const renewText = computed(() => {
  const p = { week: '7 дней', month: '30 дней', quarter: '90 дней' }[props.plan.id]
  return `Через ${p} продление будет происходить автоматически путём списания средств, пока вы не отмените подписку.`
})
</script>

<template>
  <article class="pc" :class="{ 'pc--pop': plan.popular }">
    <p v-if="plan.popular" class="pc__pop">Чаще всего выбирают</p>
    <header class="pc__head">
      <h2 class="pc__title">{{ plan.title }}</h2>
      <span class="pc__ru"><i class="pc__flag" aria-hidden="true" />Оплата картами РФ и СБП</span>
    </header>

    <div class="pc__price">
      <b class="pc__now">{{ formatPrice(plan.price) }}</b>
      <span class="pc__cur">₽</span>
    </div>
    <p class="pc__day">≈ {{ String(pricePerRequest(plan)).replace('.', ',') }} ₽ за запрос</p>

    <dl class="pc__quota">
      <div><dt>Запросов на период</dt><dd>{{ fmt(plan.requestsTotal) }}</dd></div>
      <div><dt>В сутки, до</dt><dd>{{ fmt(plan.requestsPerDay) }}</dd></div>
    </dl>

    <p class="pc__tag">{{ plan.tagline }}</p>

    <RouterLink :to="{ name: 'checkout', params: { plan: plan.id } }" class="btn btn--ink btn--block">
      Получить доступ на {{ plan.title }}
    </RouterLink>

    <ul class="pc__list">
      <li v-for="f in plan.features" :key="f.text"><Icon :name="f.icon" :size="18" />{{ f.text }}</li>
    </ul>

    <footer class="pc__foot">
      <em>Только текст — без загрузки, анализа и генерации изображений</em>
      <small>{{ renewText }}</small>
    </footer>
  </article>
</template>

<style scoped>
.pc {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 26px 24px 22px;
  border-radius: var(--radius-l);
  background: var(--bg-elev);
  border: 1px solid var(--line);
  transition: border-color 0.2s var(--ease);
}
.pc:hover {
  border-color: var(--text-3);
}
.pc--pop {
  border: 2px solid var(--ink);
  padding: 25px 23px 21px;
}
.pc__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.pc__title {
  margin: 0;
  font: 700 22px/1.2 var(--font-display);
  letter-spacing: -0.02em;
}
.pc__ru {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 140px;
  font-size: 12px;
  line-height: 1.25;
  text-align: right;
  color: var(--text-2);
}
.pc__flag {
  flex: none;
  width: 18px;
  height: 12px;
  border-radius: 2px;
  background: linear-gradient(#fff 0 33.3%, #1c57c7 33.3% 66.6%, #d52b1e 66.6%);
  box-shadow: 0 0 0 1px var(--line);
}
.pc__pop {
  margin: -8px 0 12px;
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
}
.pc__price {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 24px;
}
.pc__now {
  font: 700 46px/1 var(--font-display);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.pc__cur {
  font-size: 18px;
  color: var(--text-2);
  margin-left: -4px;
}
.pc__day {
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 13px;
}
.pc__quota {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 18px 0 0;
  border-block: 1px solid var(--line);
}
.pc__quota div {
  padding: 12px 0;
}
.pc__quota div + div {
  padding-left: 16px;
  border-left: 1px solid var(--line);
}
.pc__quota dt {
  font-size: 12px;
  color: var(--text-3);
}
.pc__quota dd {
  margin: 2px 0 0;
  font: 700 24px/1.1 var(--font-display);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.pc__tag {
  min-height: 3em;
  margin: 16px 0 18px;
  font-weight: 600;
  line-height: 1.45;
}
.pc__list {
  display: grid;
  gap: 12px;
  margin: 22px 0 26px;
  padding: 0;
  list-style: none;
  font-size: 14px;
}
.pc__list li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.pc__list :deep(svg) {
  flex: none;
  color: var(--text-2);
}
.pc__foot {
  display: grid;
  gap: 8px;
  margin-top: auto;
  font-size: 13px;
  color: var(--text-3);
}
.pc__foot em {
  color: var(--text-2);
}
</style>
