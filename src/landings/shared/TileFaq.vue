<script setup lang="ts">
import { faq } from '@/content/landing'

defineProps<{ title?: string }>()
</script>

<template>
  <section class="tf" aria-labelledby="tf-title">
    <h2 id="tf-title" class="tf__h">{{ title ?? 'Частые вопросы' }}</h2>
    <div class="tf__list">
      <details v-for="(f, i) in faq" :key="f.q" class="tf__tile" name="tf" :open="i === 0">
        <summary>
          <span>{{ f.q }}</span>
          <i class="tf__pm" aria-hidden="true" />
        </summary>
        <p>{{ f.a }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.tf {
  display: grid;
  grid-template-columns: 4fr 8fr;
  gap: 32px;
  align-items: start;
  padding-block: clamp(120px, 14vw, 200px);
}
.tf__h {
  position: sticky;
  top: 96px;
  margin: 0;
  font: var(--h-weight, 600) clamp(36px, 4vw, 64px) / 1 var(--f-display);
  letter-spacing: -0.03em;
}
.tf__list {
  display: grid;
  gap: 8px;
}
.tf__tile {
  border-radius: var(--radius, 0);
  background: var(--surface);
  color: var(--ink);
  transition: background-color 0.2s;
}
.tf__tile[open] {
  background: var(--accent);
  color: var(--accent-ink);
}
.tf__tile summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 72px;
  padding: 0 24px;
  font: 500 20px/1.3 var(--f-text);
  cursor: pointer;
  list-style: none;
}
.tf__tile summary::-webkit-details-marker {
  display: none;
}
.tf__tile summary:hover span {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.tf__pm {
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
}
.tf__pm::before,
.tf__pm::after {
  content: '';
  position: absolute;
  top: 6.5px;
  left: 0;
  width: 16px;
  height: 3px;
  background: currentColor;
  transition: transform 0.25s ease;
}
.tf__pm::after {
  transform: rotate(90deg);
}
.tf__tile[open] .tf__pm::after {
  transform: rotate(0);
}
.tf__tile p {
  max-width: 52ch;
  margin: 0;
  padding: 0 24px 24px;
  font: 400 17px/1.55 var(--f-text);
}
@media (max-width: 760px) {
  .tf {
    grid-template-columns: 1fr;
  }
  .tf__h {
    position: static;
    font-size: 9vw;
  }
  .tf__tile summary {
    min-height: 64px;
    font-size: 18px;
    padding: 12px 20px;
  }
  .tf__tile p {
    padding: 0 20px 20px;
    font-size: 16px;
  }
}
</style>
