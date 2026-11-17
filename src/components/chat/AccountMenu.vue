<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { OPERATOR, tgLink } from '@/content/legal/operator'
import { useUserStore } from '@/stores/user'

/**
 * Блок пользователя внизу сайдбара: вся строка (аватар, имя, тариф) одна кнопка,
 * по нажатию над ней открывается меню аккаунта.
 */
const props = defineProps<{ userLabel: string; isPaid: boolean }>()
const emit = defineEmits<{ navigate: [] }>()

const user = useUserStore()
const router = useRouter()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)

const initials = computed(() => props.userLabel.slice(0, 2).toUpperCase())
const supportHref = tgLink(OPERATOR.supportBot)
const until = computed(() => {
  const s = user.user?.subscription
  return s ? new Date(s.expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : ''
})
/** Вторая строка под именем: срок подписки, «Без подписки» или приглашение войти. */
const status = computed(() => {
  if (user.isGuest) return 'Войти или зарегистрироваться'
  if (props.isPaid) return `Подписка до ${until.value}`
  return 'Без подписки'
})

const items = () => [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]

function toggle() {
  open.value = !open.value
}
function close(focusTrigger = false) {
  open.value = false
  if (focusTrigger) trigger.value?.focus()
}
/** Пункт выбран: меню закрывается, сайдбар на телефоне тоже. */
function picked() {
  close()
  emit('navigate')
}
async function logout() {
  close()
  await user.logout()
  router.push('/')
}

function onKey(e: KeyboardEvent) {
  const list = items()
  const i = list.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'Escape') {
    // Esc закрывает только меню, а не весь сайдбар
    e.stopPropagation()
    close(true)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    list[(i + step + list.length) % list.length]?.focus()
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    ;(e.key === 'Home' ? list[0] : list[list.length - 1])?.focus()
  } else if (e.key === 'Tab') close()
}

function onOutside(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) close()
}
watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onOutside)
    nextTick(() => items()[0]?.focus())
  } else document.removeEventListener('pointerdown', onOutside)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="am">
    <div v-if="open" id="account-menu" ref="menu" class="am__menu" role="menu" aria-label="Меню аккаунта" @keydown="onKey">
      <template v-if="!user.isGuest">
        <RouterLink :to="{ name: 'account' }" class="am__item am__head" role="menuitem" tabindex="-1" @click="picked">
          <span class="am__avatar">{{ initials }}</span>
          <span class="am__who"><b>{{ userLabel }}</b><small>{{ status }}</small></span>
          <Icon name="chevron" :size="16" class="am__go" />
        </RouterLink>
        <hr class="am__sep" />
        <RouterLink to="/pricing" class="am__item am__item--accent" role="menuitem" tabindex="-1" @click="picked">
          <Icon name="spark" :size="18" />{{ isPaid ? 'Продлить подписку' : 'Оформить подписку' }}
        </RouterLink>
        <RouterLink :to="{ name: 'account' }" class="am__item" role="menuitem" tabindex="-1" @click="picked">
          <Icon name="user" :size="18" />Аккаунт
        </RouterLink>
        <RouterLink v-if="user.showUnprotected" :to="{ name: 'account' }" class="am__item" role="menuitem" tabindex="-1" @click="picked">
          <Icon name="shield" :size="18" />Защитить аккаунт<span class="am__dot" aria-label="Аккаунт не защищён" />
        </RouterLink>
      </template>
      <template v-else>
        <RouterLink :to="{ name: 'login', query: { next: '/chat' } }" class="am__item am__item--accent" role="menuitem" tabindex="-1" @click="picked">
          <Icon name="user" :size="18" />Войти или зарегистрироваться
        </RouterLink>
        <RouterLink to="/pricing" class="am__item" role="menuitem" tabindex="-1" @click="picked">
          <Icon name="spark" :size="18" />Тарифы
        </RouterLink>
      </template>
      <hr class="am__sep" />
      <RouterLink to="/faq" class="am__item" role="menuitem" tabindex="-1" @click="picked">
        <Icon name="help" :size="18" />Вопросы и ответы
      </RouterLink>
      <a :href="supportHref" class="am__item" role="menuitem" tabindex="-1" target="_blank" rel="noopener noreferrer" @click="close()">
        <Icon name="bubble" :size="18" />Написать в поддержку
      </a>
      <button v-if="!user.isGuest" type="button" class="am__item" role="menuitem" tabindex="-1" @click="logout">
        <Icon name="logout" :size="18" />Выйти
      </button>
    </div>

    <button
      ref="trigger"
      type="button"
      class="am__btn"
      :class="{ 'is-open': open }"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="account-menu"
      @click="toggle"
    >
      <span class="am__avatar">{{ initials }}<span v-if="user.showUnprotected" class="am__badge" /></span>
      <span class="am__who"><b>{{ userLabel }}</b><small>{{ status }}</small></span>
    </button>
  </div>
</template>

<style scoped>
.am {
  position: relative;
}
.am__btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 8px;
  border-radius: 12px;
  text-align: left;
  background: transparent;
  transition: background-color 0.15s;
}
.am__btn:hover,
.am__btn.is-open {
  background: color-mix(in srgb, var(--text) 6%, transparent);
}
.am__btn:active {
  background: color-mix(in srgb, var(--text) 10%, transparent);
}
.am__avatar {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.am__badge {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px var(--bg-sunken);
}
.am__who {
  display: grid;
  min-width: 0;
  line-height: 1.3;
}
.am__who b,
.am__who small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.am__who b {
  font-weight: 500;
  font-size: 14px;
}
.am__who small {
  font-size: 12.5px;
  color: var(--text-3);
}
.am__menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 10;
  display: grid;
  gap: 2px;
  padding: 6px;
  border-radius: 16px;
  background: var(--bg-elev);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  transform-origin: bottom center;
  animation: am-in 0.14s var(--ease, ease-out);
}
@keyframes am-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .am__menu {
    animation: none;
  }
}
.am__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 14px;
  text-align: left;
  color: var(--text);
  outline: none;
}
.am__item:hover,
.am__item:focus-visible {
  background: color-mix(in srgb, var(--text) 7%, transparent);
}
.am__item :deep(svg) {
  flex: none;
  color: var(--text-2);
}
.am__item--accent {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}
.am__item--accent :deep(svg) {
  color: var(--accent);
}
.am__head {
  min-height: 52px;
}
.am__head .am__go {
  margin-left: auto;
  transform: rotate(-90deg);
}
.am__dot {
  width: 7px;
  height: 7px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--danger);
}
.am__sep {
  margin: 4px 8px;
  border: 0;
  border-top: 1px solid var(--line);
}
</style>
