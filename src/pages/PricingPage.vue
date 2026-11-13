<script setup lang="ts">
import { onMounted } from 'vue'
import PlanCard from '@/components/pricing/PlanCard.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import { CONTINUE_PROMPT, LIMITS, MODEL } from '@/config/app'
import { fmt } from '@/content/plans'
import { useBillingStore } from '@/stores/billing'

const billing = useBillingStore()

onMounted(() => {
  if (!billing.plans.length) void billing.loadPlans()
})

/** Как считаются запросы — те же правила, что применяет сервер. */
const RULES = [
  { k: '1 запрос', v: `Одно ваше сообщение и ответ модели. «${CONTINUE_PROMPT}» после оборванного ответа — тоже запрос.` },
  { k: 'Все чаты', v: 'Лимиты общие на все чаты. Создавать новые чаты можно сколько угодно.' },
  { k: '00:00 МСК', v: 'Суточный лимит обновляется в полночь по Москве. Лимит периода — после оплаты нового периода.' },
  { k: `${LIMITS.contextMessages} сообщений`, v: `Модель видит ${LIMITS.contextMessages} последних сообщений чата, до ${fmt(LIMITS.inputTokens)} токенов. Если больше — самые старые не попадают в контекст, но остаются в истории.` },
  { k: `${fmt(LIMITS.outputTokens)} токенов`, v: `Максимальная длина ответа. Если ответ оборвался, напишите «${CONTINUE_PROMPT}».` },
  { k: 'По одному', v: `Один запрос за раз, не чаще ${LIMITS.perMinute} в минуту и ${LIMITS.perHour} в час.` },
]

const TRUST = [
  { icon: 'shield', title: 'Безопасная оплата', text: 'Платёж проходит на защищённой странице банка-эквайера. Мы не видим данные карты.' },
  { icon: 'card', title: 'Карты РФ и СБП', text: 'МИР, Visa и Mastercard российских банков, СБП и SberPay.' },
  { icon: 'x', title: 'Отмена в один клик', text: 'Автопродление отключается в профиле в любой момент.' },
]
</script>

<template>
  <div class="page">
    <AppHeader />
    <main class="wrap">
      <div class="intro">
        <h1>Тарифы ChatGPT</h1>
        <p>Модель {{ MODEL.name }}, только текст. Выберите период — без VPN и с оплатой российскими картами.</p>
      </div>

      <div class="grid" :class="{ 'is-loading': billing.loading }" aria-live="polite">
        <PlanCard v-for="p in billing.plans" :key="p.id" :plan="p" />
        <template v-if="!billing.plans.length">
          <div v-for="i in 3" :key="i" class="skeleton" />
        </template>
      </div>

      <section class="rules" aria-labelledby="rules-h">
        <h2 id="rules-h">Как считаются запросы</h2>
        <dl>
          <div v-for="r in RULES" :key="r.k"><dt>{{ r.k }}</dt><dd>{{ r.v }}</dd></div>
        </dl>
        <p class="rules__note">История чатов хранится и после окончания подписки — продлите её, и можно продолжать с того же места.</p>
      </section>

      <ul class="trust">
        <li v-for="t in TRUST" :key="t.title">
          <Icon :name="t.icon" :size="22" />
          <div><b>{{ t.title }}</b><p>{{ t.text }}</p></div>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
}
.wrap {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: clamp(28px, 5vw, 56px) 16px 64px;
}
.intro {
  display: grid;
  justify-items: center;
  gap: 14px;
  text-align: center;
  margin-bottom: 40px;
}
h1 {
  margin: 0;
  font: 700 clamp(28px, 4.6vw, 44px) / 1.1 var(--font-display);
  letter-spacing: -0.03em;
}
.intro p {
  margin: 0 0 10px;
  max-width: 520px;
  color: var(--text-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  transition: opacity 0.2s;
}
.grid.is-loading {
  opacity: 0.55;
}
.skeleton {
  height: 560px;
  border-radius: var(--radius-l);
  background: linear-gradient(100deg, var(--bg-sunken) 40%, var(--bg-elev) 50%, var(--bg-sunken) 60%) 0 0 / 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
.rules {
  margin-top: 56px;
}
.rules h2 {
  margin: 0 0 20px;
  font: 700 clamp(22px, 3vw, 28px) / 1.15 var(--font-display);
  letter-spacing: -0.02em;
}
.rules dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 24px;
  margin: 0;
}
.rules dl div {
  padding: 16px 0;
  border-top: 1px solid var(--line);
}
.rules dt {
  font: 700 18px/1.2 var(--font-display);
}
.rules dd {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-2);
}
.rules__note {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
.trust {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin: 56px 0 0;
  padding: 28px 0 0;
  list-style: none;
  border-top: 1px solid var(--line);
}
.trust li {
  display: flex;
  gap: 14px;
}
.trust :deep(svg) {
  flex: none;
  color: var(--accent);
}
.trust p {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
@media (max-width: 920px) {
  .grid {
    grid-template-columns: 1fr;
    max-width: 480px;
    margin: 0 auto;
  }
  .trust,
  .rules dl {
    grid-template-columns: 1fr;
  }
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
