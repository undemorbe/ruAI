<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { AdminError, adminApi } from '../api'
import { bumpIdle, notice, session } from '../state'

/** Вход: логин, пароль и 6-значный код из приложения-аутентификатора (TOTP). */
const login = ref('')
const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const lockedUntil = ref(0)
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(tick))

const demo = import.meta.env.VITE_ADMIN_MOCKS === 'true'
const wait = computed(() => Math.max(0, Math.ceil((lockedUntil.value - now.value) / 1000)))
const canSubmit = computed(() => !busy.value && !wait.value && login.value && password.value && /^\d{6}$/.test(code.value))

function onCode(e: Event) {
  code.value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = null
  notice.value = null
  try {
    session.value = await adminApi.login({ login: login.value.trim(), password: password.value, code: code.value })
    password.value = ''
    bumpIdle()
  } catch (e) {
    const err = e as AdminError
    if (err.status === 429 && err.retryAfter) lockedUntil.value = Date.now() + err.retryAfter * 1000
    error.value = err.message || 'Не удалось войти'
    code.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="lg">
    <form class="lg__card" novalidate @submit.prevent="submit">
      <h1>Вход в панель</h1>
      <p v-if="notice" class="lg__notice">{{ notice }}</p>

      <label class="lg__f">
        <span>Логин</span>
        <input v-model="login" class="field" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required />
      </label>
      <label class="lg__f">
        <span>Пароль</span>
        <input v-model="password" class="field" type="password" name="password" autocomplete="current-password" required />
      </label>
      <label class="lg__f">
        <span>Код из приложения-аутентификатора</span>
        <input
          :value="code"
          class="field lg__code"
          name="otp"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="\d{6}"
          maxlength="6"
          placeholder="000000"
          required
          @input="onCode"
        />
      </label>

      <p v-if="error" class="lg__err" role="alert">
        {{ error }}<template v-if="wait"> Повторить можно через {{ wait }} с.</template>
      </p>
      <button class="btn btn--ink btn--block" :disabled="!canSubmit">{{ busy ? 'Проверяем…' : 'Войти' }}</button>
      <p v-if="demo" class="lg__demo">Демо-режим: admin / demo / 000000</p>
    </form>
  </main>
</template>

<style scoped>
.lg {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 24px 16px;
}
.lg__card {
  display: grid;
  gap: 14px;
  width: min(380px, 100%);
  padding: 28px 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-elev);
}
h1 {
  margin: 0 0 4px;
  font: 600 22px/1.2 var(--font-display);
}
.lg__f {
  display: grid;
  gap: 6px;
  color: var(--text-2);
  font-size: 13.5px;
}
.lg__code {
  font-family: var(--font-mono);
  font-size: 20px;
  letter-spacing: 0.3em;
}
.lg__notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-sunken);
  color: var(--text-2);
  font-size: 13.5px;
}
.lg__err {
  margin: 0;
  color: var(--danger);
  font-size: 14px;
}
.lg__demo {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  text-align: center;
}
</style>
