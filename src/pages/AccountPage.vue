<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import AppHeader from '@/components/ui/AppHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import UnprotectedBanner from '@/components/ui/UnprotectedBanner.vue'
import { OPERATOR, tgHandle, tgLink } from '@/content/legal/operator'
import { TIER_LABEL } from '@/content/plans'
import { PASSWORD_MAX, passwordError } from '@/lib/auth'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const user = useUserStore()

const sub = computed(() => (user.isPaid ? (user.user?.subscription ?? null) : null))
const until = computed(() => (sub.value ? new Date(sub.value.expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''))

onMounted(async () => {
  await user.ensure()
  if (user.isGuest) router.replace({ name: 'login', query: { next: '/account' } })
})

// ---------- отключение Telegram ----------
const unlinkSent = ref(false)
const unlinkError = ref<string | null>(null)
let poll: ReturnType<typeof setInterval> | undefined
onBeforeUnmount(() => clearInterval(poll))

async function unlink() {
  unlinkError.value = null
  try {
    await api.auth.unlinkTelegram()
    unlinkSent.value = true
    let n = 0
    // подтверждение в боте закрывает все сессии: ждём выхода и ведём на вход
    poll = setInterval(async () => {
      if (++n > 200) return clearInterval(poll)
      await user.fetchMe()
      if (user.isGuest) {
        clearInterval(poll)
        router.replace({ name: 'login' })
      } else if (!user.user?.telegram) clearInterval(poll)
    }, 3000)
  } catch (e) {
    unlinkError.value = (e as Error).message || 'Не удалось отправить запрос'
  }
}

// ---------- смена пароля ----------
const cur = ref('')
const pw1 = ref('')
const pw2 = ref('')
const pwTouched = ref(false)
const pwBusy = ref(false)
const pwMsg = ref<{ ok: boolean; text: string } | null>(null)
const pwErr = computed(() => passwordError(pw1.value, user.user?.login ?? '') ?? (pw1.value !== pw2.value ? 'Пароли не совпадают' : null))

async function changePassword() {
  pwTouched.value = true
  pwMsg.value = null
  if (!cur.value || pwErr.value || pwBusy.value) return
  pwBusy.value = true
  try {
    await api.auth.changePassword(cur.value, pw1.value)
    cur.value = pw1.value = pw2.value = ''
    pwTouched.value = false
    pwMsg.value = { ok: true, text: 'Пароль изменён. Другие устройства вышли из аккаунта.' }
  } catch (e) {
    pwMsg.value = { ok: false, text: (e as Error).message || 'Не удалось сменить пароль' }
  } finally {
    pwBusy.value = false
  }
}

async function logout() {
  await user.logout()
  router.push('/')
}
</script>

<template>
  <div class="page ym-hide-content ym-disable-keys">
    <AppHeader />
    <main v-if="user.user && !user.isGuest" class="acc">
      <h1>Аккаунт</h1>

      <section class="card" aria-labelledby="acc-main">
        <h2 id="acc-main">Профиль</h2>
        <dl class="kv">
          <dt>Логин</dt>
          <dd>{{ user.user.login }}</dd>
          <dt>Email для чеков</dt>
          <dd>{{ user.user.email ?? 'появится после первой оплаты' }}</dd>
          <dt>Подписка</dt>
          <dd class="kv__sub">
            <span v-if="sub">{{ TIER_LABEL[sub.tier] }}, до {{ until }}</span>
            <RouterLink v-else to="/pricing">Нет активной. Выбрать тариф</RouterLink>
            <a :href="tgLink(OPERATOR.supportBot)" class="kv__help" target="_blank" rel="noopener noreferrer">Написать в поддержку</a>
          </dd>
        </dl>
      </section>

      <section class="card" aria-labelledby="acc-sec">
        <h2 id="acc-sec">Безопасность</h2>
        <template v-if="user.user.telegram">
          <p class="ok"><Icon name="shield" :size="18" /> Telegram подключён: вход подтверждается в боте, пароль можно восстановить.</p>
          <p v-if="unlinkSent" class="note" role="status">Подтвердите отключение в боте. После этого все устройства выйдут из аккаунта, войдите заново.</p>
          <button v-else type="button" class="btn btn--ghost" @click="unlink">Отключить Telegram</button>
          <p v-if="unlinkError" class="err" role="alert">{{ unlinkError }}</p>
        </template>
        <p v-else-if="!user.user.tgEnabled" class="note">Подключение Telegram временно недоступно. Пароль пока можно восстановить только через поддержку:
          <a :href="tgLink(OPERATOR.supportBot)" target="_blank" rel="noopener noreferrer">{{ tgHandle(OPERATOR.supportBot) }}</a>.
        </p>
        <UnprotectedBanner v-else variant="block" />
      </section>

      <section class="card" aria-labelledby="acc-pw">
        <h2 id="acc-pw">Пароль</h2>
        <form class="pw" novalidate @submit.prevent="changePassword">
          <!-- скрытый логин помогает менеджеру паролей связать новый пароль с аккаунтом -->
          <input type="text" name="username" autocomplete="username" :value="user.user.login" hidden readonly />
          <label class="lbl" for="pw-cur">Текущий пароль</label>
          <input id="pw-cur" v-model="cur" class="field" type="password" autocomplete="current-password" :maxlength="PASSWORD_MAX" required />
          <label class="lbl" for="pw-new">Новый пароль</label>
          <input id="pw-new" v-model="pw1" class="field" :class="{ bad: pwTouched && pwErr }" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" required />
          <label class="lbl" for="pw-new2">Повторите новый пароль</label>
          <input id="pw-new2" v-model="pw2" class="field" :class="{ bad: pwTouched && pwErr }" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" required />
          <p v-if="pwTouched && (pwErr || !cur)" class="err">{{ !cur ? 'Введите текущий пароль' : pwErr }}</p>
          <p v-if="pwMsg" :class="pwMsg.ok ? 'done' : 'err'" role="status">{{ pwMsg.text }}</p>
          <button type="submit" class="btn btn--ink" :disabled="pwBusy">{{ pwBusy ? 'Меняем…' : 'Сменить пароль' }}</button>
        </form>
      </section>

      <button type="button" class="out" @click="logout">Выйти из аккаунта</button>
    </main>
  </div>
</template>

<style scoped>
.acc {
  display: grid;
  gap: 16px;
  width: min(640px, 100%);
  margin: 0 auto;
  padding: 24px 16px 56px;
}
h1 {
  margin: 8px 0 4px;
  font: 700 clamp(26px, 4vw, 34px) / 1.15 var(--font-display);
  letter-spacing: -0.03em;
}
.card {
  display: grid;
  gap: 12px;
  padding: clamp(18px, 4vw, 24px);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-elev);
}
h2 {
  margin: 0;
  font: 600 18px/1.3 var(--font-display);
}
.kv {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  margin: 0;
}
.kv dt {
  color: var(--text-2);
}
.kv dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.kv a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.kv__sub {
  display: grid;
  justify-items: start;
  gap: 4px;
}
.kv .kv__help {
  font-size: 14px;
  color: var(--text-2);
}
@media (max-width: 480px) {
  .kv {
    grid-template-columns: 1fr;
    gap: 2px;
  }
  .kv dd {
    margin-bottom: 8px;
  }
}
.ok {
  display: flex;
  gap: 8px;
  margin: 0;
  color: var(--text);
}
.ok :deep(svg) {
  flex: none;
  margin-top: 2px;
  color: var(--ok);
}
.note {
  margin: 0;
  color: var(--text-2);
}
.card > .btn {
  justify-self: start;
}
.pw {
  display: grid;
  gap: 8px;
  max-width: 360px;
}
.lbl {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}
.field.bad {
  border-color: var(--danger);
}
.pw .btn {
  justify-self: start;
  margin-top: 10px;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
.done {
  margin: 0;
  color: var(--ok);
  font-size: 14px;
}
.out {
  justify-self: start;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-2);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
</style>
