<script setup lang="ts">
import AppHeader from '@/components/ui/AppHeader.vue'
import Crumbs from '@/components/ui/Crumbs.vue'
import Icon from '@/components/ui/Icon.vue'
import { paymentPage as p } from '@/content/payment'
</script>

<template>
  <div class="page">
    <AppHeader />
    <main class="wrap">
      <Crumbs />
      <h1>{{ p.h1 }}</h1>
      <p class="lead">{{ p.lead }}</p>

      <section aria-labelledby="pm-methods">
        <h2 id="pm-methods">Способы оплаты</h2>
        <ul class="cards">
          <li v-for="m in p.methods" :key="m.title">
            <Icon :name="m.icon" :size="22" />
            <div><h3>{{ m.title }}</h3><p>{{ m.text }}</p></div>
          </li>
        </ul>
      </section>

      <section aria-labelledby="pm-steps">
        <h2 id="pm-steps">Как оформить подписку</h2>
        <ol class="steps">
          <li v-for="s in p.steps" :key="s.title"><b>{{ s.title }}.</b> {{ s.text }}</li>
        </ol>
      </section>

      <section aria-labelledby="pm-notes">
        <h2 id="pm-notes">Цены и отмена</h2>
        <div class="notes">
          <div v-for="n in p.notes" :key="n.title"><h3>{{ n.title }}</h3><p>{{ n.text }}</p></div>
        </div>
      </section>

      <p class="more">
        <RouterLink to="/pricing" class="btn btn--ink">Выбрать тариф</RouterLink>
        <RouterLink to="/faq">Вопросы и ответы</RouterLink>
      </p>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
}
.wrap {
  width: min(860px, 100%);
  margin: 0 auto;
  padding: clamp(28px, 5vw, 56px) 16px 80px;
}
h1 {
  margin: 0;
  font: 700 clamp(28px, 4.6vw, 44px) / 1.1 var(--font-display);
  letter-spacing: -0.03em;
}
.lead {
  margin: 12px 0 8px;
  max-width: 640px;
  color: var(--text-2);
  font-size: 17px;
}
h2 {
  margin: 44px 0 16px;
  font: 600 22px/1.3 var(--font-display);
}
h3 {
  margin: 0;
  font: 600 16px/1.35 var(--font-display);
}
.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cards li {
  display: flex;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-l, 16px);
  background: var(--bg-elev);
}
.cards :deep(svg) {
  flex: none;
  color: var(--accent);
}
.cards p,
.notes p {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-2);
}
.steps {
  display: grid;
  gap: 10px;
  margin: 0;
  padding-left: 22px;
}
.notes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  margin-top: 44px;
}
@media (max-width: 720px) {
  .cards,
  .notes {
    grid-template-columns: 1fr;
  }
}
</style>
