<script setup lang="ts">
import AppHeader from '@/components/ui/AppHeader.vue'
import Crumbs from '@/components/ui/Crumbs.vue'
import { faq } from '@/content/landing'
import { seoForPath } from '@/seo/pages'
import { FAQ_INTRO } from '@/content/landing-seo'

const h1 = seoForPath('/faq').h1
</script>

<template>
  <div class="page">
    <AppHeader />
    <main class="wrap">
      <Crumbs />
      <h1>{{ h1 }}</h1>
      <p class="lead">{{ FAQ_INTRO }}</p>
      <div class="list">
        <details v-for="(f, i) in faq" :key="f.q" class="item" :open="i === 0">
          <summary>{{ f.q }}</summary>
          <p>{{ f.a }}</p>
        </details>
      </div>
      <p class="more">
        <RouterLink to="/pricing">Тарифы</RouterLink>
        <RouterLink to="/payment">Оплата в рублях</RouterLink>
        <RouterLink to="/chat" class="btn btn--ink">Открыть чат</RouterLink>
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
  width: min(760px, 100%);
  margin: 0 auto;
  padding: clamp(28px, 5vw, 56px) 16px 80px;
}
h1 {
  margin: 0;
  font: 700 clamp(28px, 4.6vw, 44px) / 1.1 var(--font-display);
  letter-spacing: -0.03em;
}
.lead {
  margin: 12px 0 32px;
  color: var(--text-2);
}
.list {
  display: grid;
  gap: 8px;
}
.item {
  border: 1px solid var(--line);
  border-radius: var(--radius-l, 16px);
  background: var(--bg-elev);
}
.item summary {
  padding: 16px 18px;
  font: 600 17px/1.35 var(--font-display);
  cursor: pointer;
}
.item p {
  margin: 0;
  padding: 0 18px 18px;
  color: var(--text-2);
}
.more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  margin-top: 36px;
}
</style>
