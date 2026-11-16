<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'

/**
 * Предложение зарегистрироваться: гость не может отправлять сообщения и оплачивать подписку.
 * `next` - куда вернуться после входа (проверяет safeNext на странице входа).
 */
const props = defineProps<{ reason: 'chat' | 'pay'; next: string }>()
const emit = defineEmits<{ close: [] }>()

const copy = computed(() =>
  props.reason === 'pay'
    ? {
        title: 'Войдите, чтобы оформить подписку',
        text: 'Подписка привязывается к аккаунту: так запросы и история чатов будут в одном месте. Регистрация занимает минуту: нужны только логин и пароль.',
      }
    : {
        title: 'Зарегистрируйтесь, чтобы отправить сообщение',
        text: 'Аккаунт хранит историю чатов и подписку. Нужны только логин и пароль. Ваш текст останется в поле ввода.',
      },
)
const q = computed(() => ({ next: props.next }))

const primary = ref<HTMLElement | null>(null)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  ;(primary.value as { $el?: HTMLElement } | null)?.$el?.focus()
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="ad" role="dialog" aria-modal="true" :aria-label="copy.title" @click.self="emit('close')">
    <div class="ad__card">
      <button class="ad__x" aria-label="Закрыть" @click="emit('close')"><Icon name="x" /></button>
      <span class="ad__badge"><Icon name="user" :size="22" /></span>
      <h2>{{ copy.title }}</h2>
      <p>{{ copy.text }}</p>
      <RouterLink ref="primary" :to="{ name: 'register', query: q }" class="btn btn--ink btn--block">Зарегистрироваться</RouterLink>
      <RouterLink :to="{ name: 'login', query: q }" class="btn btn--block ad__login">Уже есть аккаунт? Войти</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.ad {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(10 10 14 / 0.5);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  animation: fade 0.2s;
}
.ad__card {
  position: relative;
  width: min(400px, 100%);
  padding: 28px 24px 18px;
  border-radius: var(--radius-l);
  background: var(--bg-elev);
  box-shadow: var(--shadow);
  text-align: center;
  animation: up 0.3s var(--ease);
}
.ad__x {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 6px;
  color: var(--text-3);
}
.ad__badge {
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
  margin: 0 0 22px;
  color: var(--text-2);
}
.ad__login {
  margin-top: 6px;
  color: var(--text-2);
}
/* телефон: шторка снизу, под большим пальцем */
@media (max-width: 520px) {
  .ad {
    place-items: end stretch;
    padding: 0;
  }
  .ad__card {
    width: 100%;
    padding-bottom: max(18px, env(safe-area-inset-bottom));
    border-radius: var(--radius-l) var(--radius-l) 0 0;
    animation-name: sheet;
  }
  .ad__x {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    top: 6px;
    right: 6px;
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
