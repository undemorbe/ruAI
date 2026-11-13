<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, type PaymentInfo } from '@/api'
import AppHeader from '@/components/ui/AppHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import { formatPrice } from '@/lib/format'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const user = useUserStore()
const info = ref<PaymentInfo | null>(null)
const failed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let tries = 0

/** Polls payment status: provider webhooks update it on the backend asynchronously. */
async function poll() {
  const id = route.query.paymentId
  if (typeof id !== 'string') {
    failed.value = true
    return
  }
  try {
    info.value = await api.billing.payment(id)
    if (info.value.status === 'pending' && tries++ < 20) timer = setTimeout(poll, 2000)
    // оплата открыла новый период — подтягиваем подписку и обнулённые счётчики
    else if (info.value.status === 'succeeded') void user.fetchMe()
  } catch {
    failed.value = true
  }
}
onMounted(poll)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div>
    <AppHeader />
    <main class="res">
      <div v-if="!info && !failed" class="res__state">
        <span class="spin" />
        <h1>Проверяем оплату…</h1>
        <p>Обычно это занимает несколько секунд.</p>
      </div>

      <div v-else-if="info?.status === 'succeeded'" class="res__state">
        <span class="badge ok"><Icon name="check" :size="30" :stroke="2.4" /></span>
        <h1>Оплата прошла</h1>
        <p>Подписка активна. Чек отправлен на почту — {{ formatPrice(info.amount) }} ₽.</p>
        <RouterLink to="/chat" class="btn btn--ink">Перейти в чат</RouterLink>
      </div>

      <div v-else-if="info?.status === 'pending'" class="res__state">
        <span class="spin" />
        <h1>Ожидаем подтверждение банка</h1>
        <p>Можно закрыть страницу — доступ откроется автоматически.</p>
      </div>

      <div v-else class="res__state">
        <span class="badge bad"><Icon name="x" :size="28" :stroke="2.4" /></span>
        <h1>Платёж не прошёл</h1>
        <p>Деньги не списаны. Попробуйте другой способ оплаты.</p>
        <RouterLink to="/pricing" class="btn btn--ink">Вернуться к тарифам</RouterLink>
      </div>
    </main>
  </div>
</template>

<style scoped>
.res {
  display: grid;
  place-items: center;
  min-height: calc(100dvh - 70px);
  padding: 24px 16px;
}
.res__state {
  display: grid;
  justify-items: center;
  gap: 6px;
  text-align: center;
  animation: rise 0.5s var(--ease) both;
}
h1 {
  margin: 18px 0 0;
  font: 700 clamp(24px, 4vw, 34px) / 1.15 var(--font-display);
  letter-spacing: -0.03em;
}
p {
  margin: 0 0 20px;
  color: var(--text-2);
  max-width: 380px;
}
.badge {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  color: #fff;
}
.ok {
  background: var(--ok);
  animation: pop 0.5s var(--ease) both;
}
.bad {
  background: var(--danger);
}
.spin {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 3px solid var(--line-strong);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
</style>
