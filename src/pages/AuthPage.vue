<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '@/api'
import { MOCK_CODE } from '@/api/mocks'
import BrandMark from '@/components/ui/BrandMark.vue'
import { env } from '@/config/env'
import { AUTH_TEXT } from '@/content/auth'
import { LEGAL_VERSION } from '@/content/legal/operator'
import { CODE_LENGTH, LOGIN_MAX, PASSWORD_MAX, cleanCode, isCode, loginError, passwordError, safeNext } from '@/lib/auth'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const mode = computed<'login' | 'register'>(() => (route.meta.mode === 'register' ? 'register' : 'login'))
const next = computed(() => safeNext(route.query.next))
const otherMode = computed(() => ({
  name: mode.value === 'login' ? 'register' : 'login',
  query: route.query.next ? { next: next.value } : {},
}))

/** form: логин и пароль; wait: ждём подтверждения в Telegram; forgot: запрос ссылки на сброс. */
const step = ref<'form' | 'wait' | 'forgot' | 'forgot-sent'>('form')
const login = ref('')
const password = ref('')
const password2 = ref('')
const agreeTerms = ref(false)
const agreePd = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const touched = ref(false)
const challenge = ref<{ id: string; expiresAt: number; sent: boolean } | null>(null)
const code = ref('')
const codeEl = ref<HTMLInputElement | null>(null)
let poll: ReturnType<typeof setInterval> | undefined
/** Опрос заявки раз в 2 с (nginx пропускает 40 в минуту). */
const POLL_MS = 2000

const loginErr = computed(() => (mode.value === 'register' ? loginError(login.value) : login.value.trim() ? null : 'Введите логин'))
const passErr = computed(() => (mode.value === 'register' ? passwordError(password.value, login.value) : password.value ? null : 'Введите пароль'))
const pass2Err = computed(() => (mode.value === 'register' && password2.value !== password.value ? 'Пароли не совпадают' : null))
const consentOk = computed(() => mode.value === 'login' || (agreeTerms.value && agreePd.value))
const formOk = computed(() => !loginErr.value && !passErr.value && !pass2Err.value && consentOk.value)

/** Уже вошли: сразу туда, куда шли. */
onMounted(async () => {
  if (!user.user) await user.fetchMe()
  if (user.user && !user.user.isGuest) router.replace(next.value)
})
onBeforeUnmount(() => clearInterval(poll))
// переход «Вход» ⇄ «Регистрация» сбрасывает форму
watch(mode, () => backToForm(null))

async function done() {
  clearInterval(poll)
  await router.replace(next.value)
}

function backToForm(message: string | null) {
  clearInterval(poll)
  step.value = 'form'
  challenge.value = null
  code.value = ''
  touched.value = false
  error.value = message
}

async function submit() {
  touched.value = true
  error.value = null
  if (!formOk.value || busy.value) return
  busy.value = true
  try {
    if (mode.value === 'register') {
      await user.register(login.value, password.value, { version: LEGAL_VERSION, terms: true, personalData: true })
      return await done()
    }
    const r = await user.login(login.value, password.value)
    if (r.done) return await done()
    challenge.value = { id: r.challenge, expiresAt: Date.parse(r.expiresAt), sent: r.sent }
    password.value = ''
    step.value = 'wait'
    clearInterval(poll)
    if (r.sent) poll = setInterval(checkPoll, POLL_MS)
    await nextTick()
    codeEl.value?.focus()
  } catch (e) {
    error.value = (e as Error).message || 'Не удалось войти'
  } finally {
    busy.value = false
  }
}

async function checkPoll() {
  if (!challenge.value || busy.value) return
  if (Date.now() > challenge.value.expiresAt) return backToForm('Время на подтверждение вышло. Войдите ещё раз.')
  try {
    if (await user.finishChallenge(challenge.value.id)) await done()
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) backToForm(e.message)
    // сеть моргнула: следующий опрос попробует снова
  }
}

async function sendCode() {
  if (!challenge.value || !isCode(code.value) || busy.value) return
  busy.value = true
  error.value = null
  try {
    if (await user.finishChallenge(challenge.value.id, code.value)) await done()
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) return backToForm(e.message)
    error.value = (e as Error).message || 'Не удалось войти'
    code.value = ''
    codeEl.value?.focus()
  } finally {
    busy.value = false
  }
}

function onCode(e: Event) {
  code.value = cleanCode((e.target as HTMLInputElement).value)
  if (code.value.length === CODE_LENGTH) sendCode()
}

function toForgot() {
  error.value = null
  step.value = 'forgot'
}

async function forgot() {
  error.value = null
  if (!login.value.trim() || busy.value) {
    error.value = 'Введите логин'
    return
  }
  busy.value = true
  try {
    await api.auth.requestReset(login.value)
    step.value = 'forgot-sent'
  } catch (e) {
    error.value = (e as Error).message || 'Не удалось отправить ссылку'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="au ym-hide-content ym-disable-keys">
    <RouterLink to="/" class="au__brand" aria-label="ChatGPT: на главную">
      <span class="au__knot"><BrandMark /></span>
      ChatGPT
    </RouterLink>

    <section class="au__card" aria-labelledby="au-title">
      <template v-if="step === 'form'">
        <h1 id="au-title">{{ mode === 'login' ? 'Вход' : 'Регистрация' }}</h1>
        <p class="au__sub">
          {{ mode === 'login' ? AUTH_TEXT.login : AUTH_TEXT.register }}
        </p>

        <form novalidate @submit.prevent="submit">
          <label class="au__lbl" for="au-login">Логин</label>
          <input
            id="au-login"
            v-model="login"
            class="au__field"
            :class="{ bad: touched && loginErr }"
            type="text"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            :maxlength="LOGIN_MAX"
            :placeholder="mode === 'register' ? 'например, ivan.petrov' : ''"
            :aria-invalid="touched && !!loginErr"
            aria-describedby="au-login-err"
            required
          />
          <p v-if="touched && loginErr" id="au-login-err" class="au__err">{{ loginErr }}</p>
          <p v-else-if="mode === 'register'" class="au__hint">Латиница, цифры, точка, дефис, подчёркивание</p>

          <label class="au__lbl au__lbl--next" for="au-pass">Пароль</label>
          <input
            id="au-pass"
            v-model="password"
            class="au__field"
            :class="{ bad: touched && passErr }"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            :maxlength="PASSWORD_MAX"
            :aria-invalid="touched && !!passErr"
            aria-describedby="au-pass-err"
            required
          />
          <p v-if="touched && passErr" id="au-pass-err" class="au__err">{{ passErr }}</p>
          <p v-else-if="mode === 'register'" class="au__hint">Не короче 8 символов</p>

          <template v-if="mode === 'register'">
            <label class="au__lbl au__lbl--next" for="au-pass2">Повторите пароль</label>
            <input
              id="au-pass2"
              v-model="password2"
              class="au__field"
              :class="{ bad: touched && pass2Err }"
              type="password"
              autocomplete="new-password"
              :maxlength="PASSWORD_MAX"
              :aria-invalid="touched && !!pass2Err"
              aria-describedby="au-pass2-err"
              required
            />
            <p v-if="touched && pass2Err" id="au-pass2-err" class="au__err">{{ pass2Err }}</p>

            <label class="au__agree">
              <input v-model="agreeTerms" type="checkbox" />
              <span>
                Принимаю <RouterLink :to="{ name: 'legal', params: { doc: 'terms' } }" target="_blank">условия использования</RouterLink> и
                <RouterLink :to="{ name: 'legal', params: { doc: 'privacy' } }" target="_blank">политику обработки персональных данных</RouterLink>
              </span>
            </label>
            <label class="au__agree">
              <input v-model="agreePd" type="checkbox" />
              <span>
                Даю <RouterLink :to="{ name: 'legal', params: { doc: 'consent' } }" target="_blank">согласие на обработку персональных данных</RouterLink>,
                в том числе на передачу текста запросов провайдеру нейросети
              </span>
            </label>
            <p v-if="touched && !consentOk" class="au__err">Без этих согласий зарегистрироваться нельзя</p>
          </template>

          <p v-if="error" class="au__err" role="alert">{{ error }}</p>
          <button class="btn btn--ink btn--block au__go" type="submit" :disabled="busy">
            {{ busy ? (mode === 'login' ? 'Входим…' : 'Создаём…') : mode === 'login' ? 'Войти' : 'Создать аккаунт' }}
          </button>
        </form>

        <div v-if="mode === 'login'" class="au__row">
          <button type="button" class="au__link" @click="toForgot">Забыли пароль?</button>
        </div>
        <p class="au__switch">
          {{ mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?' }}
          <RouterLink :to="otherMode">{{ mode === 'login' ? 'Зарегистрироваться' : 'Войти' }}</RouterLink>
        </p>
      </template>

      <template v-else-if="step === 'wait'">
        <h1 id="au-title">Подтвердите вход в Telegram</h1>
        <p v-if="challenge?.sent" class="au__sub">
          Мы отправили запрос в бот. Нажмите там «Подтвердить» или введите код из сообщения. Страница обновится сама.
        </p>
        <p v-else class="au__sub" role="alert">Не удалось отправить сообщение в Telegram. Подождите минуту и войдите ещё раз.</p>

        <form v-if="challenge?.sent" novalidate @submit.prevent="sendCode">
          <label class="au__lbl" for="au-code">Код из сообщения</label>
          <input
            id="au-code"
            ref="codeEl"
            :value="code"
            class="au__field au__code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            :maxlength="CODE_LENGTH + 2"
            :placeholder="'•'.repeat(CODE_LENGTH)"
            :aria-invalid="!!error"
            @input="onCode"
          />
          <p v-if="env.useMocks" class="au__hint">Демо-режим: «бот» подтвердит сам через пару секунд, код {{ MOCK_CODE }}</p>
          <p v-if="error" class="au__err" role="alert">{{ error }}</p>
          <button class="btn btn--ink btn--block au__go" type="submit" :disabled="busy || code.length !== CODE_LENGTH">
            {{ busy ? 'Проверяем…' : 'Войти' }}
          </button>
        </form>

        <div class="au__row">
          <button type="button" class="au__link" @click="backToForm(null)">Назад</button>
        </div>
      </template>

      <template v-else-if="step === 'forgot'">
        <h1 id="au-title">Восстановление пароля</h1>
        <p class="au__sub">Пришлём ссылку для смены пароля в Telegram, подключённый к аккаунту.</p>
        <form novalidate @submit.prevent="forgot">
          <label class="au__lbl" for="au-flogin">Логин</label>
          <input
            id="au-flogin"
            v-model="login"
            class="au__field"
            type="text"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            :maxlength="LOGIN_MAX"
            required
          />
          <p v-if="error" class="au__err" role="alert">{{ error }}</p>
          <button class="btn btn--ink btn--block au__go" type="submit" :disabled="busy">
            {{ busy ? 'Отправляем…' : 'Отправить ссылку в Telegram' }}
          </button>
        </form>
        <p class="au__hint au__note">Если Telegram не был подключён, восстановить пароль можно только через поддержку.</p>
        <div class="au__row">
          <button type="button" class="au__link" @click="backToForm(null)">Ко входу</button>
        </div>
      </template>

      <template v-else>
        <h1 id="au-title">Проверьте Telegram</h1>
        <p class="au__sub">Если к аккаунту подключён Telegram, мы отправили туда ссылку для смены пароля. Она действует 15 минут.</p>
        <button type="button" class="btn btn--ink btn--block au__go" @click="backToForm(null)">Ко входу</button>
      </template>
    </section>

    <p class="au__foot">
      <RouterLink :to="{ name: 'legal' }">Документы</RouterLink>
    </p>
  </main>
</template>

<style scoped>
.au {
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 28px;
  min-height: 100dvh;
  padding: max(28px, env(safe-area-inset-top)) 16px 40px;
  background: var(--bg);
}
.au__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: clamp(8px, 6vh, 64px);
  font: 700 20px/1 var(--font-display);
  letter-spacing: -0.02em;
}
.au__knot {
  width: 28px;
  height: 28px;
}
.au__card {
  width: min(100%, 420px);
  padding: clamp(24px, 5vw, 36px);
  border: 1px solid var(--line);
  border-radius: var(--radius-l);
  background: var(--bg-elev);
  box-shadow: var(--shadow);
}
.au__card h1 {
  margin: 0;
  font: 700 28px/1.15 var(--font-display);
  letter-spacing: -0.02em;
}
.au__sub {
  margin: 10px 0 24px;
  color: var(--text-2);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.au__sub b {
  color: var(--text);
}
.au__lbl {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}
.au__lbl--next {
  margin-top: 18px;
}
.au__field {
  width: 100%;
  min-height: 50px;
  padding: 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-s);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.au__field:focus {
  outline: none;
  border-color: var(--text-2);
  box-shadow: var(--focus);
}
.au__field.bad {
  border-color: var(--danger);
}
.au__code {
  font: 600 24px/1 var(--font-mono);
  letter-spacing: 0.4em;
  text-align: center;
}
.au__agree {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-2);
  cursor: pointer;
}
.au__agree + .au__agree {
  margin-top: 12px;
}
.au__agree input {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: var(--accent);
}
.au__agree a,
.au__switch a,
.au__foot a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.au__err {
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 13px;
}
.au__hint {
  margin: 8px 0 0;
  color: var(--text-3);
  font-size: 13px;
}
.au__note {
  margin-top: 16px;
  line-height: 1.45;
}
.au__go {
  min-height: 50px;
  margin-top: 22px;
}
.au__row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
}
.au__link {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-2);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.au__link:hover:not(:disabled) {
  color: var(--text);
  text-decoration: underline;
}
.au__link:disabled {
  color: var(--text-3);
  cursor: default;
}
.au__switch {
  margin: 20px 0 0;
  font-size: 14px;
  color: var(--text-2);
  text-align: center;
}
.au__foot {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}
</style>
