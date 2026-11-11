<script setup lang="ts">
import { computed, ref } from 'vue'

/** "Fixed output, live controls": the reader configures a real ruAI answer on the left. */
const tone = ref<'formal' | 'friendly' | 'short'>('formal')
const length = ref(2)
const steps = ref(true)
const name = ref('Олег')

const TONES = [
  { id: 'formal', label: 'Деловой' },
  { id: 'friendly', label: 'Дружеский' },
  { id: 'short', label: 'Коротко' },
] as const

const letter = computed(() => {
  const who = name.value.trim() || 'коллега'
  const greet = { formal: `Добрый день, ${who}!`, friendly: `Привет, ${who}!`, short: `${who},` }[tone.value]
  const body = {
    formal: [
      'Предлагаю перенести нашу встречу на четверг, 15:00.',
      'В среду у меня пересекается защита бюджета, и я не смогу уделить вопросу должного внимания.',
      'Если время неудобно, предложите своё — подстроюсь.',
    ],
    friendly: [
      'Давай перенесём созвон на четверг, 15:00?',
      'В среду у меня завал с бюджетом, не хочу говорить на бегу.',
      'Если не получается — кинь своё время, подстроюсь.',
    ],
    short: ['Переносим на четверг, 15:00.', 'В среду не успеваю.', 'Неудобно — напиши своё время.'],
  }[tone.value].slice(0, length.value + 1)
  return { greet, body }
})
</script>

<template>
  <section class="lf" aria-labelledby="lf-title">
    <div class="lf__stage">
      <article class="lf__out" data-ui aria-live="polite">
        <header class="lf__meta">
          <span>Ответ ruAI</span>
          <span>Письмо · {{ letter.body.length }} {{ letter.body.length === 1 ? 'фраза' : 'фразы' }}</span>
        </header>
        <p class="lf__greet">{{ letter.greet }}</p>
        <p v-for="(s, i) in letter.body" :key="tone + i" class="lf__line">{{ s }}</p>
        <ol v-if="steps" class="lf__steps">
          <li>Подтвердить время в календаре</li>
          <li>Переслать повестку участникам</li>
        </ol>
        <p class="lf__sign">{{ tone === 'formal' ? 'С уважением, Анна' : 'Анна' }}</p>
      </article>
    </div>

    <div class="lf__col">
      <h2 id="lf-title" class="lf__h">Настройте ответ сами</h2>

      <div class="lf__block">
        <p class="lf__claim">Тон под ситуацию</p>
        <p class="lf__txt">Один и тот же смысл — для начальника, друга или чата в Telegram.</p>
        <div class="lf__seg" role="radiogroup" aria-label="Тон письма">
          <button v-for="t in TONES" :key="t.id" role="radio" :aria-checked="tone === t.id" :class="{ on: tone === t.id }" @click="tone = t.id">
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="lf__block">
        <p class="lf__claim">Длина без воды</p>
        <p class="lf__txt">Скажите «короче» — и ruAI выбросит лишнее, а не смысл.</p>
        <label class="lf__range">
          <span>Фраз в письме: {{ length + 1 }}</span>
          <input v-model.number="length" type="range" min="0" max="2" step="1" />
        </label>
      </div>

      <div class="lf__block">
        <p class="lf__claim">Список дел в конце</p>
        <p class="lf__txt">Попросите план — ответ закончится конкретными шагами.</p>
        <label class="lf__toggle">
          <input v-model="steps" type="checkbox" role="switch" />
          <span class="lf__sw" aria-hidden="true" />
          <span>{{ steps ? 'Шаги добавлены' : 'Без шагов' }}</span>
        </label>
      </div>

      <div class="lf__block">
        <p class="lf__claim">Помнит детали</p>
        <p class="lf__txt">Имена, даты и договорённости из начала диалога не теряются.</p>
        <label class="lf__field">
          <span>Кому пишем</span>
          <input v-model="name" type="text" maxlength="24" autocomplete="off" />
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lf {
  display: grid;
  grid-template-columns: 6fr 1fr 5fr;
  margin-inline: calc(var(--margin) * -1);
}
.lf__stage {
  position: sticky;
  top: 0;
  height: 100svh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--lf-stage, var(--surface));
}
.lf__out {
  width: min(420px, 100%);
  padding: 28px;
  border-radius: 12px;
  background: var(--ui-bg, #fff);
  color: var(--ui-ink, #16151a);
  font: 400 16px/1.55 var(--ui-font, var(--f-text));
}
.lf__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  font-size: 13px;
  color: var(--ui-soft, #6b6873);
}
.lf__greet {
  margin: 0 0 10px;
  font-weight: 600;
}
.lf__line {
  margin: 0 0 8px;
  animation: lf-in 0.3s ease both;
}
.lf__steps {
  margin: 14px 0 0;
  padding-left: 20px;
}
.lf__sign {
  margin: 18px 0 0;
  color: var(--ui-soft, #6b6873);
}
.lf__col {
  grid-column: 3;
  padding: 72px var(--margin) 25vh 0;
}
.lf__h {
  margin: 0 0 72px;
  font: var(--h-weight, 500) clamp(32px, 3vw, 44px) / 1.05 var(--f-display);
  letter-spacing: -0.02em;
}
.lf__block {
  max-width: 44ch;
  min-height: 46vh;
}
.lf__claim {
  margin: 0;
  font: 500 clamp(24px, 2.2vw, 32px) / 1.15 var(--f-display);
  letter-spacing: -0.02em;
}
.lf__txt {
  margin: 12px 0 24px;
  font: 400 17px/1.55 var(--f-text);
}
.lf__seg {
  display: inline-flex;
  padding: 4px;
  border-radius: var(--radius, 8px);
  background: var(--surface);
}
.lf__seg button {
  min-height: 40px;
  padding: 0 16px;
  border-radius: calc(var(--radius, 8px) - 2px);
  font: 500 15px var(--f-text);
  color: var(--ink);
  transition: background-color 0.15s;
}
.lf__seg button.on {
  background: var(--accent);
  color: var(--accent-ink);
}
.lf__range,
.lf__field {
  display: grid;
  gap: 10px;
  max-width: 320px;
  font: 500 15px var(--f-text);
}
.lf__range input {
  accent-color: var(--accent);
  height: 32px;
}
.lf__field input {
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius, 8px);
  background: var(--surface);
  color: var(--ink);
  font: 400 16px var(--f-text);
}
.lf__field input:focus {
  outline: 3px solid var(--accent);
}
.lf__toggle {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font: 500 15px var(--f-text);
  cursor: pointer;
}
.lf__toggle input {
  position: absolute;
  opacity: 0;
}
.lf__sw {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 999px;
  background: var(--surface);
  transition: background-color 0.2s;
}
.lf__sw::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ink);
  transition: transform 0.2s ease;
}
.lf__toggle input:checked + .lf__sw {
  background: var(--accent);
}
.lf__toggle input:checked + .lf__sw::after {
  transform: translateX(20px);
  background: var(--accent-ink);
}
.lf__toggle input:focus-visible + .lf__sw {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
@keyframes lf-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
@media (max-width: 860px) {
  .lf {
    grid-template-columns: 1fr;
  }
  .lf__stage {
    z-index: 2;
    height: 46svh;
    align-items: start;
    overflow: hidden;
    padding: 16px;
  }
  .lf__out {
    padding: 20px;
  }
  .lf__col {
    grid-column: 1;
    padding: 40px var(--margin) 10vh;
  }
  .lf__h {
    margin-bottom: 40px;
  }
  .lf__block {
    min-height: 0;
    margin-bottom: 56px;
  }
  .lf__claim {
    font-size: 22px;
  }
  .lf__txt {
    font-size: 16px;
  }
}
</style>
