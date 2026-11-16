<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, api } from '@/api'
import BrandMark from '@/components/ui/BrandMark.vue'
import { PASSWORD_MAX, passwordError } from '@/lib/auth'
import { readResetToken } from '@/lib/resetToken'

/** Смена пароля по ссылке из бота: /reset#<токен>. Токен во фрагменте не уходит на сервер с запросом страницы. */
const token = ref<string | null>(null)
const pw1 = ref('')
const pw2 = ref('')
const touched = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)
const gone = ref(false)
const pwErr = computed(() => passwordError(pw1.value, '') ?? (pw1.value !== pw2.value ? 'Пароли не совпадают' : null))

onMounted(() => {
  token.value = readResetToken(window.location, window.history)
})

async function submit() {
  touched.value = true
  error.value = null
  if (!token.value || pwErr.value || busy.value) return
  busy.value = true
  try {
    await api.auth.confirmReset(token.value, pw1.value)
    done.value = true
    token.value = null
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) gone.value = true
    else error.value = (e as Error).message || 'Не удалось сменить пароль'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="au">
    <RouterLink to="/" class="au__brand" aria-label="ChatGPT: на главную">
      <span class="au__knot"><BrandMark /></span>
      ChatGPT
    </RouterLink>

    <section class="au__card" aria-labelledby="rs-title">
      <template v-if="done">
        <h1 id="rs-title">Пароль изменён</h1>
        <p class="au__sub">Все устройства вышли из аккаунта. Войдите с новым паролем.</p>
        <RouterLink :to="{ name: 'login' }" class="btn btn--ink btn--block au__go">Войти</RouterLink>
      </template>
      <template v-else-if="gone || !token">
        <h1 id="rs-title">Ссылка не работает</h1>
        <p class="au__sub">
          {{ gone ? 'Ссылка устарела или уже использована.' : 'Ссылка неполная. Откройте её из сообщения бота ещё раз.' }}
          Новую ссылку можно запросить на странице входа: «Забыли пароль?».
        </p>
        <RouterLink :to="{ name: 'login' }" class="btn btn--ink btn--block au__go">Ко входу</RouterLink>
      </template>
      <template v-else>
        <h1 id="rs-title">Новый пароль</h1>
        <p class="au__sub">После смены все устройства выйдут из аккаунта.</p>
        <form novalidate @submit.prevent="submit">
          <label class="au__lbl" for="rs-pw">Новый пароль</label>
          <input id="rs-pw" v-model="pw1" class="au__field" :class="{ bad: touched && pwErr }" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" required />
          <label class="au__lbl au__lbl--next" for="rs-pw2">Повторите пароль</label>
          <input id="rs-pw2" v-model="pw2" class="au__field" :class="{ bad: touched && pwErr }" type="password" autocomplete="new-password" :maxlength="PASSWORD_MAX" required />
          <p v-if="touched && pwErr" class="au__err">{{ pwErr }}</p>
          <p v-if="error" class="au__err" role="alert">{{ error }}</p>
          <button class="btn btn--ink btn--block au__go" type="submit" :disabled="busy">{{ busy ? 'Сохраняем…' : 'Сохранить пароль' }}</button>
        </form>
      </template>
    </section>
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
.au__err {
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 13px;
}
.au__go {
  min-height: 50px;
  margin-top: 22px;
}
</style>
