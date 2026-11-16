<script setup lang="ts">
import { consent, setConsent } from '@/lib/analytics'
</script>

<template>
  <aside v-if="consent === null" class="cb" role="region" aria-label="Cookies и аналитика">
    <p class="cb__text">
      Используем Яндекс Метрику и cookies, чтобы понимать, что улучшить на сайте. Без вашего согласия аналитика не включается.
      <RouterLink to="/legal/privacy" class="cb__link">Подробнее</RouterLink>
    </p>
    <div class="cb__actions">
      <button type="button" class="btn btn--ghost cb__btn" @click="setConsent('denied')">Отказаться</button>
      <button type="button" class="btn btn--ink cb__btn" @click="setConsent('granted')">Принять</button>
    </div>
  </aside>
</template>

<style scoped>
.cb {
  position: fixed;
  z-index: 60;
  inset-inline: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: center;
  justify-content: space-between;
  max-width: 720px;
  margin-inline: auto;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-elev);
  color: var(--text);
  box-shadow: var(--shadow);
  font-size: 14px;
  line-height: 1.45;
}
.cb__text {
  flex: 1 1 320px;
  margin: 0;
}
.cb__link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cb__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.cb__btn {
  min-height: 40px;
}
@media (max-width: 420px) {
  .cb__actions {
    flex: 1 1 100%;
  }
  .cb__btn {
    flex: 1;
  }
}
</style>
