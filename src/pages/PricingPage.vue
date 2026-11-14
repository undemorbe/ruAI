<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { PlanId } from '@/api'
import PlanCard from '@/components/pricing/PlanCard.vue'
import TierToggle from '@/components/pricing/TierToggle.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import { formatPrice } from '@/lib/format'
import { useBillingStore } from '@/stores/billing'

const billing = useBillingStore()
const route = useRoute()
/** На телефоне вместо трёх одинаковых карточек подряд — переключатель периода. */
const picked = ref<PlanId>('month')

onMounted(() => {
  const t = route.query.tier
  if (t === 'text' || t === 'media') billing.tier = t
  if (!billing.plans.length || billing.plans[0]?.tier !== billing.tier) void billing.loadPlans()
})

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
        <p>Выберите период. Все тарифы — без VPN, на русском и с оплатой российскими картами.</p>
        <TierToggle v-model="billing.tier" />
      </div>

      <div v-if="billing.plans.length" class="seg" role="tablist" aria-label="Период подписки">
        <button
          v-for="p in billing.plans"
          :key="p.id"
          class="seg__btn"
          role="tab"
          :aria-selected="picked === p.id"
          :class="{ on: picked === p.id }"
          @click="picked = p.id"
        >
          <b>{{ p.title }}</b><span>{{ formatPrice(p.price) }} ₽</span>
        </button>
      </div>

      <div class="grid" :class="{ 'is-loading': billing.loading }" aria-live="polite">
        <PlanCard v-for="p in billing.plans" :key="p.id + p.tier" :plan="p" :class="{ 'is-picked': p.id === picked }" />
        <template v-if="!billing.plans.length">
          <div v-for="i in 3" :key="i" class="skeleton" />
        </template>
      </div>

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
.seg {
  display: none;
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
  .trust {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .intro {
    margin-bottom: 20px;
  }
}
/* one column of cards: show one period at a time instead of three identical cards in a row */
@media (max-width: 920px) {
  .seg {
    max-width: 480px;
    position: sticky;
    top: calc(64px + env(safe-area-inset-top, 0px));
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin: 0 auto 14px;
    width: 100%;
    padding: 4px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--bg-sunken) 92%, transparent);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    border: 1px solid var(--line);
  }
  .seg__btn {
    display: grid;
    gap: 2px;
    min-height: 52px;
    padding: 6px 4px;
    border-radius: 12px;
    color: var(--text-2);
    transition:
      background 0.2s,
      color 0.2s;
  }
  .seg__btn b {
    font: 600 15px/1.2 var(--font-display);
  }
  .seg__btn span {
    font-size: 13px;
  }
  .seg__btn.on {
    background: var(--ink);
    color: var(--ink-text);
  }
  .grid > :not(.is-picked):not(.skeleton) {
    display: none;
  }
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
