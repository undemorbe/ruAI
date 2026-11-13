<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PlanCard from '@/components/pricing/PlanCard.vue'
import TierToggle from '@/components/pricing/TierToggle.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import { useBillingStore } from '@/stores/billing'

const billing = useBillingStore()
const route = useRoute()

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

      <div class="grid" :class="{ 'is-loading': billing.loading }" aria-live="polite">
        <PlanCard v-for="p in billing.plans" :key="p.id + p.tier" :plan="p" />
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
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
