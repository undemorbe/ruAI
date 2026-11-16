<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AdminError, adminApi, type InviteInfo } from '../api'
import { checkInvitePassword, groupSecret, MIN_ADMIN_PASSWORD } from '../invite'
import { notice } from '../state'

/** Новый администратор по ссылке: задаёт пароль и подключает 6-значный код (TOTP). */
const props = defineProps<{ token: string }>()
const emit = defineEmits<{ done: [] }>()

const info = ref<InviteInfo | null>(null)
const loadError = ref<string | null>(null)
const password = ref('')
const again = ref('')
const code = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

const pwdError = computed(() => (password.value || again.value ? checkInvitePassword(password.value, again.value) : null))
const canSubmit = computed(() => !busy.value && !checkInvitePassword(password.value, again.value) && /^\d{6}$/.test(code.value))

onMounted(async () => {
  try {
    info.value = await adminApi.inviteInfo(props.token)
  } catch (e) {
    loadError.value = (e as Error).message || 'Не удалось открыть приглашение'
  }
})

function onCode(e: Event) {
  code.value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = null
  try {
    const { login } = await adminApi.acceptInvite({ token: props.token, password: password.value, code: code.value })
    password.value = again.value = ''
    notice.value = `Аккаунт ${login} создан. Войдите с паролем и кодом из приложения.`
    emit('done')
  } catch (e) {
    error.value = (e as AdminError).message || 'Не удалось создать аккаунт'
    code.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="iv">
    <form class="iv__card" novalidate @submit.prevent="submit">
      <h1>Доступ к панели</h1>
      <p v-if="loadError" class="iv__err" role="alert">{{ loadError }}</p>
      <p v-else-if="!info" class="muted">Проверяем ссылку…</p>
      <template v-else>
        <p class="iv__lead">
          Ваш логин: <b class="mono">{{ info.login }}</b>. Ссылка одноразовая, действует до
          {{ new Date(info.expiresAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }}.
        </p>

        <section class="iv__step">
          <h2>1. Подключите код входа</h2>
          <p class="muted">
            Приложение-аутентификатор (Aegis, 2FAS, Google Authenticator, 1Password): добавьте аккаунт вручную, тип TOTP,
            6 цифр, 30 секунд.
          </p>
          <div class="iv__secret">
            <span class="muted">Ключ</span>
            <code class="mono">{{ groupSecret(info.secret) }}</code>
          </div>
          <a class="btn btn--block" :href="info.uri">Открыть в приложении на этом телефоне</a>
        </section>

        <section class="iv__step">
          <h2>2. Придумайте пароль</h2>
          <label class="iv__f">
            <span>Пароль, от {{ MIN_ADMIN_PASSWORD }} символов</span>
            <input v-model="password" class="field" type="password" name="new-password" autocomplete="new-password" required />
          </label>
          <label class="iv__f">
            <span>Пароль ещё раз</span>
            <input v-model="again" class="field" type="password" name="new-password-again" autocomplete="new-password" required />
          </label>
          <p v-if="pwdError" class="iv__hint">{{ pwdError }}</p>
          <input class="iv__user" name="username" autocomplete="username" :value="info.login" readonly tabindex="-1" aria-hidden="true" />
        </section>

        <section class="iv__step">
          <h2>3. Введите код из приложения</h2>
          <input
            :value="code"
            class="field iv__code"
            name="otp"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="000000"
            aria-label="Код из приложения"
            required
            @input="onCode"
          />
        </section>

        <p v-if="error" class="iv__err" role="alert">{{ error }}</p>
        <button class="btn btn--ink btn--block" :disabled="!canSubmit">{{ busy ? 'Создаём…' : 'Создать аккаунт' }}</button>
      </template>
    </form>
  </main>
</template>

<style scoped>
.iv {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 24px 16px;
}
.iv__card {
  display: grid;
  gap: 16px;
  width: min(440px, 100%);
  padding: 28px 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-elev);
}
h1 {
  margin: 0;
  font: 600 22px/1.2 var(--font-display);
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.iv__lead {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
}
.iv__step {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.iv__step p {
  margin: 0;
  font-size: 13.5px;
}
.iv__secret {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-sunken);
  font-size: 13px;
}
.iv__secret code {
  font-size: 15px;
  letter-spacing: 0.04em;
  overflow-wrap: break-word;
  user-select: all;
}
.iv__f {
  display: grid;
  gap: 6px;
  color: var(--text-2);
  font-size: 13.5px;
}
.iv__code {
  font-family: var(--font-mono);
  font-size: 20px;
  letter-spacing: 0.3em;
}
.iv__hint {
  color: var(--text-3);
}
.iv__err {
  margin: 0;
  color: var(--danger);
  font-size: 14px;
}
/* для менеджера паролей: сохранит пароль вместе с логином */
.iv__user {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
