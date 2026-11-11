<script setup lang="ts">
import { useUserStore } from '@/stores/user'
import Logo from './Logo.vue'

const user = useUserStore()
</script>

<template>
  <header class="hdr">
    <RouterLink to="/" class="hdr__logo" aria-label="ruAI — на главную"><Logo :size="26" /></RouterLink>
    <nav class="hdr__nav">
      <RouterLink to="/chat" class="hdr__link">Чат</RouterLink>
      <RouterLink to="/pricing" class="hdr__link">Тарифы</RouterLink>
      <span class="hdr__user" :title="user.displayName">
        <span class="hdr__avatar">{{ user.displayName.slice(0, 2).toUpperCase() }}</span>
        <span class="hdr__email">{{ user.displayName }}</span>
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
  padding: 14px clamp(16px, 4vw, 40px);
  padding-top: max(14px, env(safe-area-inset-top));
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
.hdr__link {
  font-weight: 500;
  color: var(--text-2);
  padding: 6px 2px;
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
