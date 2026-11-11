<script setup lang="ts">
import { getPlans } from '@/content/plans'
import { formatPrice } from '@/lib/format'

/** "Plans that step up": tile height grows with the plan. Colours come from --plan-1..3 tokens. */
defineProps<{ title?: string }>()
const plans = getPlans('text')
</script>

<template>
  <section class="sp" aria-labelledby="sp-title">
    <h2 id="sp-title" class="sp__h">{{ title ?? 'Платите за время' }}</h2>
    <div class="sp__row">
      <article v-for="(p, i) in plans" :key="p.id" class="sp__tile" :class="`sp__tile--${i + 1}`">
        <div class="sp__body">
          <h3>{{ p.title }}</h3>
          <p class="sp__price">{{ formatPrice(p.price) }} ₽</p>
          <p class="sp__old">вместо {{ formatPrice(p.oldPrice) }} ₽</p>
          <ul>
            <li v-for="f in p.features" :key="f.text">{{ f.text }}</li>
          </ul>
        </div>
        <RouterLink class="sp__buy" :to="{ name: 'checkout', params: { plan: p.id }, query: { tier: 'text' } }">
          Оформить {{ p.title }}
        </RouterLink>
      </article>
    </div>
    <p class="sp__more">
      Нужны файлы и генерация изображений?
      <RouterLink :to="{ name: 'pricing', query: { tier: 'media' } }">Тарифы с медиа</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.sp {
  position: relative;
  padding-block: clamp(120px, 14vw, 200px);
}
.sp__h {
  position: absolute;
  top: clamp(120px, 14vw, 200px);
  left: 0;
  max-width: 7.5em;
  margin: 0;
  font: var(--h-weight, 700) clamp(40px, 4.4vw, 72px) / 0.95 var(--f-display);
  letter-spacing: -0.03em;
  text-transform: var(--h-case, none);
}
.sp__row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  align-items: end;
}
.sp__tile {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius, 0);
  overflow: hidden;
  transition: transform 0.2s ease;
}
.sp__tile:hover {
  transform: translateY(-6px);
}
.sp__tile--1 {
  min-height: 380px;
  background: var(--plan-1);
  color: var(--plan-1-ink);
}
.sp__tile--2 {
  min-height: 500px;
  background: var(--plan-2);
  color: var(--plan-2-ink);
}
.sp__tile--3 {
  min-height: 620px;
  background: var(--plan-3);
  color: var(--plan-3-ink);
}
.sp__body {
  flex: 1;
  padding: 28px;
}
.sp__body h3 {
  margin: 0;
  font: 700 28px/1.1 var(--f-display);
  text-transform: var(--h-case, none);
}
.sp__price {
  margin: 10px 0 0;
  font: 700 56px/1 var(--f-display);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.sp__old {
  margin: 6px 0 0;
  font: 400 16px var(--f-text);
  text-decoration: line-through;
  opacity: 0.8;
}
.sp__body ul {
  display: grid;
  gap: 6px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
  font: 400 17px/1.4 var(--f-text);
}
.sp__buy {
  display: flex;
  align-items: center;
  min-height: 64px;
  padding: 0 28px;
  background: rgb(0 0 0 / 0.28);
  font: 600 17px var(--f-text);
  transition: background-color 0.15s;
}
.sp__buy:hover,
.sp__buy:focus-visible {
  background: rgb(0 0 0 / 0.45);
}
.sp__more {
  margin: 32px 0 0;
  font: 400 17px var(--f-text);
}
.sp__more a {
  text-decoration: underline;
  text-underline-offset: 4px;
}
@media (max-width: 860px) {
  .sp__h {
    position: static;
    margin-bottom: 32px;
    font-size: 9vw;
  }
  .sp__row {
    grid-template-columns: 1fr;
  }
  .sp__tile--1,
  .sp__tile--2,
  .sp__tile--3 {
    min-height: 0;
  }
  .sp__price {
    font-size: 44px;
  }
}
</style>
