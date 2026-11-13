<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type PaymentMethod, type Plan } from '@/api'
import AppHeader from '@/components/ui/AppHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import { fmt } from '@/content/plans'
import { formatPrice } from '@/lib/format'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const plan = ref<Plan | null>(null)
const notFound = ref(false)

const email = ref(user.user?.email ?? '')
const method = ref<PaymentMethod>('card')
const agree = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const touched = ref(false)

const METHODS: { id: PaymentMethod; title: string; hint: string; icon: string }[] = [
  { id: 'card', title: 'Банковская карта', hint: 'МИР, Visa, Mastercard банков РФ', icon: 'card' },
  { id: 'sbp', title: 'СБП', hint: 'Оплата через приложение банка', icon: 'sbp' },
  { id: 'sberpay', title: 'SberPay', hint: 'В приложении СберБанк Онлайн', icon: 'wallet' },
]

const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()))
const canPay = computed(() => !!plan.value && emailOk.value && agree.value && !submitting.value)

onMounted(async () => {
  const plans = await api.billing.plans()
  plan.value = plans.find((p) => p.id === route.params.plan) ?? null
  notFound.value = !plan.value
})

async function pay() {
  touched.value = true
  if (!canPay.value || !plan.value) return
  submitting.value = true
  error.value = null
  try {
    const session = await api.billing.checkout({ planId: plan.value.id, email: email.value.trim(), method: method.value })
    const base = import.meta.env.BASE_URL
    if (session.confirmationUrl.startsWith(base)) {
      await router.push('/' + session.confirmationUrl.slice(base.length))
    } else {
      window.location.assign(session.confirmationUrl)
    }
  } catch (e) {
    error.value = (e as Error).message || 'Не удалось создать платёж'
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <AppHeader />
    <main class="wrap">
      <RouterLink to="/pricing" class="back"><Icon name="arrow" :size="16" class="back__i" /> Все тарифы</RouterLink>

      <div v-if="notFound" class="nf">
        <h1>Тариф не найден</h1>
        <RouterLink to="/pricing" class="btn btn--ink">К тарифам</RouterLink>
      </div>

      <div v-else class="grid">
        <form class="form" novalidate @submit.prevent="pay">
          <h1>Оформление подписки</h1>

          <label class="lbl" for="email">Email для чека и доступа</label>
          <input
            id="email"
            v-model="email"
            class="field"
            :class="{ bad: touched && !emailOk }"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="you@example.ru"
            required
          />
          <p v-if="touched && !emailOk" class="err">Введите корректный email</p>

          <fieldset class="methods">
            <legend class="lbl">Способ оплаты</legend>
            <label v-for="m in METHODS" :key="m.id" class="method" :class="{ on: method === m.id }">
              <input v-model="method" type="radio" name="method" :value="m.id" class="sr-only" />
              <span class="method__icon"><Icon :name="m.icon" :size="20" /></span>
              <span class="method__txt"><b>{{ m.title }}</b><small>{{ m.hint }}</small></span>
              <span class="method__dot" />
            </label>
          </fieldset>

          <label class="agree">
            <input v-model="agree" type="checkbox" />
            <span>
              Принимаю <a href="#" @click.prevent>оферту</a> и <a href="#" @click.prevent>политику конфиденциальности</a>, согласен(на) на
              автоматическое продление подписки. Отменить можно в любой момент.
            </span>
          </label>
          <p v-if="touched && !agree" class="err">Необходимо согласие с условиями</p>

          <button type="submit" class="btn btn--accent btn--block pay" :disabled="submitting">
            <Icon v-if="!submitting" name="lock" :size="17" />
            <span v-if="submitting" class="spin" aria-hidden="true" />
            {{ submitting ? 'Создаём платёж…' : plan ? `Оплатить ${formatPrice(plan.price)} ₽` : 'Оплатить' }}
          </button>
          <p v-if="error" class="err" role="alert">{{ error }}</p>
          <p class="secure"><Icon name="shield" :size="15" /> Данные карты вводятся на защищённой странице платёжного провайдера.</p>
        </form>

        <aside class="sum" aria-label="Ваш заказ">
          <template v-if="plan">
            <span class="sum__k">Ваш заказ</span>
            <h2>ChatGPT · {{ plan.title }}</h2>
            <p class="sum__tier">Только текст, без изображений</p>
            <ul>
              <li v-for="f in plan.features" :key="f.text"><Icon name="check" :size="16" />{{ f.text }}</li>
            </ul>
            <dl>
              <div><dt>Запросов на период</dt><dd>{{ fmt(plan.requestsTotal) }}</dd></div>
              <div><dt>В сутки</dt><dd>до {{ fmt(plan.requestsPerDay) }}</dd></div>
              <div class="total"><dt>К оплате</dt><dd>{{ formatPrice(plan.price) }} ₽</dd></div>
            </dl>
            <p class="sum__note">Счётчик запросов обнуляется сразу после оплаты. Далее — {{ formatPrice(plan.price) }} ₽ каждые {{ plan.periodDays }} дн., пока подписка активна.</p>
          </template>
          <div v-else class="sum__skel" />
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>
.wrap {
  width: min(1040px, 100%);
  margin: 0 auto;
  padding: 24px 16px 64px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 14px;
}
.back__i {
  transform: scaleX(-1);
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: clamp(20px, 4vw, 48px);
  align-items: start;
  margin-top: 20px;
}
h1 {
  margin: 0 0 24px;
  font: 700 clamp(24px, 3.4vw, 34px) / 1.15 var(--font-display);
  letter-spacing: -0.03em;
}
.form {
  display: grid;
}
.lbl {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.field.bad {
  border-color: var(--danger);
}
.err {
  margin: 6px 0 0;
  color: var(--danger);
  font-size: 13px;
}
.methods {
  display: grid;
  gap: 8px;
  margin: 24px 0 0;
  padding: 0;
  border: 0;
}
.method {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--line-strong);
  background: var(--bg-elev);
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.method.on {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink);
}
.method:has(input:focus-visible) {
  box-shadow: var(--focus);
}
.method__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--bg-sunken);
}
.method__txt {
  flex: 1;
  display: grid;
}
.method__txt small {
  color: var(--text-3);
  font-size: 12px;
}
.method__dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  transition: border 0.2s;
}
.method.on .method__dot {
  border: 6px solid var(--ink);
}
.agree {
  display: flex;
  gap: 10px;
  margin-top: 22px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
}
.agree input {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: var(--accent);
}
.agree a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pay {
  min-height: 54px;
  margin-top: 22px;
  font-size: 16px;
}
.spin {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: spin 0.7s linear infinite;
}
.secure {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  color: var(--text-3);
  font-size: 12px;
}
.sum {
  position: sticky;
  top: 90px;
  padding: 24px;
  border-radius: var(--radius-l);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
}
.sum__k {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
}
.sum h2 {
  margin: 8px 0 2px;
  font: 700 22px/1.2 var(--font-display);
}
.sum__tier {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
}
.sum ul {
  display: grid;
  gap: 8px;
  margin: 18px 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
}
.sum li {
  display: flex;
  gap: 8px;
}
.sum li :deep(svg) {
  flex: none;
  color: var(--ok);
  margin-top: 2px;
}
dl {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-top: 16px;
  border-top: 1px dashed var(--line-strong);
}
dl div {
  display: flex;
  justify-content: space-between;
}
dt {
  color: var(--text-2);
}
dd {
  margin: 0;
}
.ok {
  color: var(--ok);
  font-weight: 600;
}
.total {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 700;
}
.total dt {
  color: var(--text);
}
.sum__note {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
.sum__skel {
  height: 360px;
}
.nf {
  display: grid;
  justify-items: start;
  gap: 8px;
  margin-top: 40px;
}
@media (max-width: 820px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .sum {
    position: static;
    order: -1;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
