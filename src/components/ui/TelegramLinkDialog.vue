<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import { useUserStore } from '@/stores/user'

/** Привязка Telegram: одноразовая ссылка на бота, сайт ждёт подтверждения через /auth/me. */
const emit = defineEmits<{ close: [] }>()
const user = useUserStore()
const url = ref<string | null>(null)
const error = ref<string | null>(null)
const linked = ref(false)
let poll: ReturnType<typeof setInterval> | undefined
/** Ссылка живёт 10 минут: дольше не опрашиваем. */
const POLL_MS = 3000
const POLL_LIMIT = Math.ceil((10 * 60_000) / POLL_MS)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(async () => {
  document.addEventListener('keydown', onKey)
  try {
    url.value = (await api.auth.linkTelegram()).url
    let n = 0
    poll = setInterval(async () => {
      if (++n > POLL_LIMIT) {
        clearInterval(poll)
        error.value = 'Ссылка устарела. Закройте окно и попробуйте ещё раз.'
        url.value = null
        return
      }
      await user.fetchMe()
      if (user.user?.telegram) {
        linked.value = true
        clearInterval(poll)
      }
    }, POLL_MS)
  } catch (e) {
    error.value = (e as Error).message || 'Не удалось получить ссылку'
  }
})
onBeforeUnmount(() => {
  clearInterval(poll)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div class="tl ym-hide-content ym-disable-keys" role="dialog" aria-modal="true" aria-labelledby="tl-title" @click.self="emit('close')">
      <div class="tl__card">
        <button type="button" class="tl__x" aria-label="Закрыть" @click="emit('close')"><Icon name="x" /></button>
        <span class="tl__badge"><Icon name="shield" :size="22" /></span>
        <template v-if="linked">
          <h2 id="tl-title">Telegram подключён</h2>
          <p>Теперь вход подтверждается в боте, а забытый пароль можно восстановить.</p>
          <button type="button" class="btn btn--ink btn--block" @click="emit('close')">Готово</button>
        </template>
        <template v-else>
          <h2 id="tl-title">Подключите Telegram</h2>
          <ol class="tl__steps">
            <li>Откройте бота по кнопке ниже.</li>
            <li>Нажмите «Запустить» (Start).</li>
            <li>Вернитесь сюда: окно обновится само.</li>
          </ol>
          <p v-if="error" class="tl__err" role="alert">{{ error }}</p>
          <a v-else-if="url" :href="url" target="_blank" rel="noopener noreferrer" class="btn btn--ink btn--block">Открыть бота</a>
          <p v-else class="tl__wait">Готовим ссылку…</p>
          <p class="tl__note">Ссылка одноразовая и действует 10 минут. Номер телефона боту не нужен.</p>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tl {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(10 10 14 / 0.5);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  animation: fade 0.2s;
}
.tl__card {
  position: relative;
  width: min(400px, 100%);
  padding: 28px 24px 18px;
  border-radius: var(--radius-l);
  background: var(--bg-elev);
  box-shadow: var(--shadow);
  text-align: center;
  animation: up 0.3s var(--ease);
}
.tl__x {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  color: var(--text-3);
  cursor: pointer;
}
.tl__badge {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--ink);
  color: var(--ink-text);
}
h2 {
  margin: 16px 0 8px;
  font: 600 20px/1.25 var(--font-display);
}
p {
  margin: 0 0 18px;
  color: var(--text-2);
}
.tl__steps {
  margin: 0 0 20px;
  padding-left: 1.3em;
  color: var(--text-2);
  text-align: left;
  line-height: 1.6;
}
.tl__err {
  color: var(--danger);
}
.tl__wait {
  color: var(--text-3);
}
.tl__note {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--text-3);
}
@media (max-width: 520px) {
  .tl {
    place-items: end stretch;
    padding: 0;
  }
  .tl__card {
    width: 100%;
    padding-bottom: max(18px, env(safe-area-inset-bottom));
    border-radius: var(--radius-l) var(--radius-l) 0 0;
    animation-name: sheet;
  }
}
@keyframes sheet {
  from {
    transform: translateY(100%);
  }
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes up {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
}
</style>
