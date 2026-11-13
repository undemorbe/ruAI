<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

/** "A sentence with a blank": the blank is the question field, the last word submits to the chat. */
const props = withDefaults(defineProps<{ before?: string; after?: string; verb?: string; placeholder?: string; note?: string }>(), {
  before: 'Спросите ChatGPT про',
  after: 'и получите ответ —',
  verb: 'спросить',
  placeholder: 'ипотеку',
  note: 'Откроется чат с готовым вопросом. Запросы — по подписке, от 388 ₽ за 7 дней.',
})
const router = useRouter()
const q = ref('')

function go() {
  const text = q.value.trim() ? `${props.before} ${q.value.trim()}` : ''
  router.push({ name: 'chat', query: text ? { q: text } : {} })
}
</script>

<template>
  <section class="sc" aria-labelledby="sc-title">
    <form class="sc__line" @submit.prevent="go">
      <h2 id="sc-title" class="sc__h">
        {{ before }}
        <label class="sr-only" for="sc-q">О чём спросить</label>
        <input id="sc-q" v-model="q" class="sc__in" :placeholder="placeholder" autocomplete="off" enterkeyhint="go" />
        {{ after }}
        <button type="submit" class="sc__go">{{ verb }}</button>
      </h2>
    </form>
    <p class="sc__note">{{ note }}</p>
  </section>
</template>

<style scoped>
.sc {
  padding-block: clamp(120px, 16vw, 220px);
}
.sc__h {
  margin: 0;
  max-width: 22ch;
  font: var(--sc-weight, 500) clamp(34px, 6vw, 96px) / 1.08 var(--f-display);
  letter-spacing: -0.03em;
  color: var(--ink);
}
.sc__in,
.sc__go {
  display: inline-block;
  height: 1.08em;
  padding: 0 0.25em;
  vertical-align: bottom;
  font: inherit;
  letter-spacing: inherit;
  border: 0;
  border-radius: var(--radius, 0);
}
.sc__in {
  width: 6.2em;
  background: var(--surface);
  color: var(--ink);
}
.sc__in::placeholder {
  color: var(--muted);
}
.sc__in:focus {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
.sc__go {
  background: var(--accent);
  color: var(--accent-ink);
  cursor: pointer;
  transition: transform 0.14s ease;
}
.sc__go:hover {
  transform: translateY(-3px);
}
.sc__go:active {
  transform: translateY(1px);
}
.sc__note {
  margin: 28px 0 0;
  font: 400 16px/1.5 var(--f-text);
  color: var(--muted);
}
@media (max-width: 640px) {
  .sc {
    padding-block: 72px 24px;
  }
  .sc__h {
    font-size: 10vw;
  }
  .sc__in {
    display: block;
    width: 100%;
    margin: 0.08em 0;
  }
  .sc__note {
    font-size: 15px;
  }
}
</style>
