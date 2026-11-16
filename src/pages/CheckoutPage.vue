<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError, type PaymentMethod, type Plan, type PlanTier } from '@/api'
import AppHeader from '@/components/ui/AppHeader.vue'
import AuthDialog from '@/components/ui/AuthDialog.vue'
import Icon from '@/components/ui/Icon.vue'
import UnprotectedBanner from '@/components/ui/UnprotectedBanner.vue'
import { MODEL_NAME } from '@/config/app'
import { LEGAL_VERSION } from '@/content/legal/operator'
import { TIER_LABEL } from '@/content/plans'
import { isEmail, normalizeEmail } from '@/lib/auth'
import { formatPrice } from '@/lib/format'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const tier = computed<PlanTier>(() => (route.query.tier === 'media' ? 'media' : 'text'))
const plan = ref<Plan | null>(null)
const notFound = ref(false)

const method = ref<PaymentMethod>('card')
/** Только для кассового чека (54-ФЗ). Подставляется последний введённый. */
const email = ref('')
const emailOk = computed(() => isEmail(email.value))
const agreeTerms = ref(false)
const agreeRecurring = ref(false)
/** Оплата только из аккаунта: гостю - предложение войти (сервер всё равно ответит 401). */
const needAuth = computed(() => user.ready && user.isGuest)
const authAsk = ref(false)
const agreed = computed(() => agreeTerms.value && agreeRecurring.value)
const submitting = ref(false)
const error = ref<string | null>(null)
const touched = ref(false)

const METHODS: { id: PaymentMethod; title: string; hint: string; icon: string }[] = [
  { id: 'card', title: 'Банковская карта', hint: 'МИР, Visa, Mastercard банков РФ', icon: 'card' },
  { id: 'sbp', title: 'СБП', hint: 'Оплата через приложение банка', icon: 'sbp' },
  { id: 'sberpay', title: 'SberPay', hint: 'В приложении СберБанк Онлайн', icon: 'wallet' },
]

const canPay = computed(() => !!plan.value && !needAuth.value && agreed.value && emailOk.value && !submitting.value)

onMounted(async () => {
  void user.ensure().then(() => {
    authAsk.value = user.isGuest
    email.value ||= user.user?.email ?? ''
  })
  const plans = await api.billing.plans(tier.value)
  plan.value = plans.find((p) => p.id === route.params.plan) ?? null
  notFound.value = !plan.value
})

async function pay() {
  await user.ensure()
  if (user.isGuest) {
    authAsk.value = true
    return
  }
  touched.value = true
  if (!canPay.value || !plan.value) return
  submitting.value = true
  error.value = null
  try {
    const session = await api.billing.checkout({
      planId: plan.value.id,
      tier: tier.value,
      method: method.value,
      email: normalizeEmail(email.value),
      consent: { version: LEGAL_VERSION, terms: true, recurring: true },
    })
    const base = import.meta.env.BASE_URL
    if (session.confirmationUrl.startsWith(base)) {
      await router.push('/' + session.confirmationUrl.slice(base.length))
    } else {
      window.location.assign(session.confirmationUrl)
    }
  } catch (e) {
    submitting.value = false
    if (e instanceof ApiError && e.code === 'auth_required') {
      // сессия истекла, пока страница была открыта
      await user.fetchMe()
      authAsk.value = true
      return
    }
    error.value = (e as Error).message || 'Не удалось создать платёж'
  }
}
</script>

<template>
  <div class="page">
    <AppHeader />
    <main class="wrap">
      <RouterLink :to="{ name: 'pricing', query: { tier } }" class="back"><Icon name="arrow" :size="16" class="back__i" /> Все тарифы</RouterLink>

      <div v-if="notFound" class="nf">
        <h1>Тариф не найден</h1>
        <RouterLink to="/pricing" class="btn btn--ink">К тарифам</RouterLink>
      </div>

      <div v-else class="grid">
        <form class="form" novalidate @submit.prevent="pay">
          <h1>Оформление подписки</h1>

          <div v-if="needAuth" class="acc acc--guest">
            <span>Подписка оформляется из аккаунта.</span>
            <button type="button" class="acc__link" @click="authAsk = true">Войти или зарегистрироваться</button>
          </div>
          <p v-else-if="user.user?.login" class="acc">
            Аккаунт: <b>{{ user.user.login }}</b>
          </p>

          <div class="mail">
            <label class="lbl" for="co-email">Email для чека</label>
            <input
              id="co-email"
              v-model="email"
              class="field"
              :class="{ bad: touched && !emailOk }"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
              maxlength="254"
              placeholder="you@example.ru"
              :aria-invalid="touched && !emailOk"
              aria-describedby="co-email-hint"
              required
            />
            <p v-if="touched && !emailOk" id="co-email-hint" class="err">Введите корректный email: на него придёт кассовый чек</p>
            <p v-else id="co-email-hint" class="hint">Сюда придёт кассовый чек. Для входа email не используется.</p>
          </div>

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
            <input v-model="agreeTerms" type="checkbox" />
            <span>
              Принимаю <RouterLink :to="{ name: 'legal', params: { doc: 'terms' } }" target="_blank">условия использования</RouterLink> и
              <RouterLink :to="{ name: 'legal', params: { doc: 'privacy' } }" target="_blank">политику обработки персональных данных</RouterLink>
            </span>
          </label>
          <label class="agree">
            <input v-model="agreeRecurring" type="checkbox" />
            <span v-if="plan">
              Согласен(на) на автоматическое списание {{ formatPrice(plan.price) }} ₽ каждые {{ plan.periodDays }} дн., пока не отменю подписку.
              Отменить можно в любой момент.
            </span>
            <span v-else>Согласен(на) на автоматическое продление подписки</span>
          </label>
          <p v-if="touched && !agreed" class="err">Отметьте все согласия, чтобы перейти к оплате</p>
          <UnprotectedBanner variant="inline" class="unprot" />

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
            <h2>{{ MODEL_NAME }} · {{ plan.title }}</h2>
            <p class="sum__tier">{{ TIER_LABEL[tier] }}</p>
            <ul>
              <li v-for="f in plan.features" :key="f.text"><Icon name="check" :size="16" />{{ f.text }}</li>
            </ul>
            <dl>
              <div class="total"><dt>К оплате</dt><dd>{{ formatPrice(plan.price) }} ₽</dd></div>
            </dl>
            <p class="sum__note">Доступ открывается сразу после оплаты. Далее — {{ formatPrice(plan.price) }} ₽ каждые {{ plan.periodDays }} дн., пока вы не отмените подписку.</p>
          </template>
          <div v-else class="sum__skel" />
        </aside>
      </div>
    </main>
    <AuthDialog v-if="authAsk" reason="pay" :next="route.fullPath" @close="authAsk = false" />
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
  min-height: 44px;
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
.acc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0 0 20px;
  padding: 12px 14px;
  border-radius: var(--radius-s);
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 14.5px;
}
.acc b {
  color: var(--text);
  font-weight: 600;
}
.acc__link {
  color: var(--text);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.mail {
  margin: 0 0 22px;
}
.hint {
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 13px;
}
.unprot {
  margin-top: 16px;
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
.agree + .agree {
  margin-top: 12px;
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
  /* phones: short order summary above the form; plan details live on /pricing */
  .sum {
    position: static;
    order: -1;
    padding: 18px;
  }
  .sum ul {
    display: none;
  }
  .wrap {
    padding-top: 8px;
  }
  .grid {
    margin-top: 8px;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
