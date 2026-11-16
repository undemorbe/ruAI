<script setup lang="ts">
import { OPERATOR } from '@/content/legal/operator'
</script>

<template>
  <footer class="qf">
    <span class="qf__what">ChatGPT — нейросеть без VPN</span>
    <nav class="qf__links" aria-label="Подвал">
      <RouterLink to="/chat">Чат</RouterLink>
      <RouterLink to="/pricing">Тарифы</RouterLink>
      <RouterLink to="/payment">Оплата в рублях</RouterLink>
      <RouterLink to="/faq">Вопросы</RouterLink>
      <RouterLink :to="{ name: 'legal' }">Документы</RouterLink>
      <a :href="`mailto:${OPERATOR.email}`">Поддержка</a>
    </nav>
    <span class="qf__legal">© {{ new Date().getFullYear() }} · <RouterLink :to="{ name: 'legal', params: { doc: 'privacy' } }">Конфиденциальность</RouterLink> ·
      <RouterLink :to="{ name: 'legal', params: { doc: 'terms' } }">Условия</RouterLink><br />Независимый сервис, не связан с OpenAI. ChatGPT — товарный знак OpenAI.</span>
  </footer>
</template>

<style scoped>
.qf {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: baseline;
  gap: 24px;
  padding: 30svh 0 30px;
  font: 400 15px/1.5 var(--f-text);
  color: var(--muted);
}
.qf__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 24px;
}
.qf a {
  color: var(--ink);
  transition: color 0.18s;
}
.qf a:hover {
  color: var(--accent-hover, var(--accent));
}
.qf__legal {
  justify-self: end;
}
@media (max-width: 640px) {
  .qf {
    grid-template-columns: 1fr;
    gap: 8px;
    padding-top: 10svh;
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    font-size: 14px;
  }
  /* finger-sized targets */
  .qf__links {
    gap: 8px 20px;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  .qf a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .qf__legal {
    justify-self: start;
  }
}
</style>
