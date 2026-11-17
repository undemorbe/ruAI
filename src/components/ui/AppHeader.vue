<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import Logo from './Logo.vue'

/** Куда ведёт логотип: на главную (по умолчанию) или в чат, в новый чат. */
const props = withDefaults(defineProps<{ logo?: 'home' | 'chat' }>(), { logo: 'home' })
const logoLink = computed(() =>
  props.logo === 'chat' ? { to: { name: 'chat' }, label: 'ChatGPT: новый чат' } : { to: '/', label: 'ChatGPT: на главную' },
)

const user = useUserStore()
const route = useRoute()
const router = useRouter()

async function logout() {
  await user.logout()
  router.push('/')
}
</script>

<template>
  <header class="hdr">
    <RouterLink :to="logoLink.to" class="hdr__logo" :aria-label="logoLink.label"><Logo :size="26" /></RouterLink>
    <nav class="hdr__nav">
      <RouterLink to="/chat" class="hdr__link">Чат</RouterLink>
      <RouterLink to="/pricing" class="hdr__link">Тарифы</RouterLink>
      <RouterLink v-if="user.isGuest" :to="{ name: 'login', query: { next: route.fullPath } }" class="hdr__login">Войти</RouterLink>
      <span v-else class="hdr__user">
        <RouterLink :to="{ name: 'account' }" class="hdr__acc" :title="user.showUnprotected ? 'Аккаунт не защищён: подключите Telegram' : 'Аккаунт'">
          <span class="hdr__avatar">{{ user.displayName.slice(0, 2).toUpperCase() }}</span>
          <span v-if="user.showUnprotected" class="hdr__dot" aria-label="Аккаунт не защищён" />
          <span class="hdr__email">{{ user.displayName }}</span>
        </RouterLink>
        <button type="button" class="hdr__out" @click="logout">Выйти</button>
      </span>
    </nav>
  </header>
</template>

<style scoped>
.hdr {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px clamp(16px, 4vw, 40px);
  padding-top: max(8px, env(safe-area-inset-top));
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  -webkit-backdrop-filter: saturate(1.4) blur(14px);
  backdrop-filter: saturate(1.4) blur(14px);
  border-bottom: 1px solid var(--line);
}
.hdr__nav {
  display: flex;
  align-items: center;
  gap: clamp(8px, 2vw, 24px);
}
.hdr__logo {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
.hdr__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-weight: 500;
  color: var(--text-2);
  padding: 0 6px;
  transition: color 0.2s;
}
.hdr__link:hover,
.hdr__link.router-link-active {
  color: var(--text);
}
.hdr__user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  font-size: 13px;
  color: var(--text-2);
}
.hdr__login {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--ink-text);
  font-weight: 600;
  font-size: 14px;
}
.hdr__out {
  min-height: 36px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--text-3);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.hdr__out:hover {
  color: var(--text);
}
.hdr__acc {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
}
.hdr__dot {
  position: absolute;
  top: 6px;
  left: 22px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--bg-elev);
  border-radius: 50%;
  background: var(--accent);
}
.hdr__avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.hdr__email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 560px) {
  .hdr__email {
    display: none;
  }
}
</style>
