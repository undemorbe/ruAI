<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { faq, reviews } from '@/content/landing'
import { getPlans } from '@/content/plans'
import { useGoogleFont } from '@/lib/fonts'
import { formatPrice } from '@/lib/format'
import CallResponse from '../shared/CallResponse.vue'
import ChatFragment from '../shared/ChatFragment.vue'
import QuietFooter from '../shared/QuietFooter.vue'

/**
 * Variant 2 — "The quiet instrument", dark.
 * Idea: ruAI has exactly two doors — a text chat and a chat that reads files.
 * The page is as quiet as the tool: one narrow column, small exact demonstrations.
 */
useGoogleFont('family=Geologica:wght@300;400;500')

const text = getPlans('text')
const media = getPlans('media')

// ---------- doors ----------
const hovered = ref<'text' | 'media' | null>(null)

// ---------- lit panel carousel ----------
const PANELS = [
  { name: 'Диалог', lines: 'Обычный чат: спросили — получили ответ. Контекст держится весь разговор.' },
  { name: 'Выбор модели', lines: 'Lite для быстрых вопросов, Pro для кода и сложных задач.' },
  { name: 'Файлы', lines: 'PDF и таблицы: краткое содержание и ответы по тексту документа.' },
  { name: 'Код', lines: 'Объяснит ошибку и предложит правку, с подсветкой и кнопкой копирования.' },
  { name: 'История', lines: 'Все диалоги сохраняются. Можно вернуться и продолжить.' },
]
const row = ref<HTMLElement | null>(null)
const active = ref(0)
let rowObs: IntersectionObserver | null = null

function go(i: number) {
  const el = row.value?.children[i] as HTMLElement | undefined
  el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}

// ---------- faq index ----------
const sel = ref(0)
const wide = ref(true)
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(min-width: 861px)') : null
const onMq = () => (wide.value = !!mq?.matches)

onMounted(() => {
  onMq()
  mq?.addEventListener('change', onMq)
  rowObs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) active.value = Number((e.target as HTMLElement).dataset.i)
    },
    { root: row.value, threshold: 0.6 },
  )
  row.value?.querySelectorAll<HTMLElement>('.lit__panel').forEach((p) => rowObs?.observe(p))
})
onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMq)
  rowObs?.disconnect()
})

const letter = computed(() => reviews[1]!)
</script>

<template>
  <div class="v2">
    <header class="nav">
      <RouterLink to="/" class="nav__mark">ruAI</RouterLink>
      <RouterLink to="/chat" class="nav__link">Открыть чат</RouterLink>
    </header>

    <!-- HERO: two doors on a dark wall -->
    <section class="doors" aria-labelledby="h1">
      <h1 id="h1" class="doors__h">Нейросеть без VPN.<br />С чего начнём?</h1>
      <div class="doors__pair">
        <a href="#text" class="door" :class="{ dim: hovered === 'media' }" @pointerenter="hovered = 'text'" @pointerleave="hovered = null" @focus="hovered = 'text'" @blur="hovered = null">
          <div class="door__pic">
            <ChatFragment
              compact
              :messages="[
                { role: 'user', text: 'Сократи до трёх предложений' },
                { role: 'assistant', text: 'Встречу переносим на четверг, 15:00. В среду я на защите бюджета. Если неудобно — предложите своё время.' },
              ]"
            />
          </div>
          <span class="door__name">Текстовый чат</span>
          <span class="door__line">от {{ text[0]!.price }} ₽ в неделю</span>
        </a>
        <a href="#media" class="door" :class="{ dim: hovered === 'text' }" @pointerenter="hovered = 'media'" @pointerleave="hovered = null" @focus="hovered = 'media'" @blur="hovered = null">
          <div class="door__pic">
            <div class="file" data-ui>
              <div class="file__chip"><b>PDF</b> Договор_аренды.pdf · 14 стр.</div>
              <p class="file__q">Какие штрафы за досрочный выезд?</p>
              <p class="file__a">Пункт 7.3: при выезде раньше срока удерживается депозит — 45 000 ₽, если не предупредить за 30 дней.</p>
            </div>
          </div>
          <span class="door__name">Файлы и изображения</span>
          <span class="door__line">от {{ media[0]!.price }} ₽ в неделю</span>
        </a>
      </div>
    </section>

    <main class="col">
      <!-- SHOWCASE: lit panel, dark row -->
      <section id="text" class="lit" aria-labelledby="lit-h">
        <h2 id="lit-h" class="sr-only">Из чего состоит ruAI</h2>
        <div ref="row" class="lit__row">
          <div v-for="(p, i) in PANELS" :key="p.name" class="lit__panel" :class="{ on: active === i }" :data-i="i" @click="go(i)">
            <ChatFragment
              v-if="i === 0"
              title="ruAI Lite"
              composer=""
              :messages="[
                { role: 'user', text: 'Чем ипотека отличается от рассрочки?' },
                { role: 'assistant', text: 'Ипотеку даёт банк под залог жилья, с процентами. Рассрочку даёт застройщик, обычно без процентов, но на короткий срок.' },
              ]"
            />
            <div v-else-if="i === 1" class="pick" data-ui>
              <div class="pick__row on"><b>ruAI Lite</b><small>Быстрые ответы</small></div>
              <div class="pick__row"><b>ruAI Pro</b><small>Сложные задачи и код</small></div>
              <div class="pick__row"><b>ruAI Think</b><small>Глубокие рассуждения</small></div>
            </div>
            <div v-else-if="i === 2" class="file" data-ui>
              <div class="file__chip"><b>XLSX</b> Продажи_октябрь.xlsx</div>
              <p class="file__q">Какой товар просел сильнее всего?</p>
              <p class="file__a">Термокружки: 412 шт. против 655 в сентябре, минус 37%. Остальные позиции в пределах ±8%.</p>
            </div>
            <div v-else-if="i === 3" class="code" data-ui>
              <p>Ошибка в строке 12: ключа «email» нет у части записей.</p>
              <pre><code>email = row.get("email")
if email is None:
    continue</code></pre>
            </div>
            <div v-else class="hist" data-ui>
              <p class="hist__d">Сегодня</p>
              <p class="hist__i on">Маршрут по Казани</p>
              <p class="hist__i">Письмо о переносе встречи</p>
              <p class="hist__d">Ранее</p>
              <p class="hist__i">План подготовки к ЕГЭ</p>
              <p class="hist__i">SQL: выручка по месяцам</p>
            </div>
          </div>
        </div>
        <div class="lit__cap" aria-live="polite">
          <p class="lit__name">{{ PANELS[active]!.name }}</p>
          <p class="lit__lines">{{ PANELS[active]!.lines }}</p>
        </div>
      </section>

      <CallResponse />

      <!-- TESTIMONIAL: one long letter -->
      <section class="letter" aria-labelledby="letter-h">
        <h2 id="letter-h" class="sr-only">Письмо пользователя</h2>
        <p class="letter__open">Пользуюсь как вторым мнением на код-ревью.</p>
        <p>Начинал с простого: просил объяснить чужой код, который достался по наследству. Оказалось, ruAI хорошо видит, где логика ломается на краевых случаях, и объясняет, почему, а не просто переписывает.</p>
        <p>Теперь прогоняю через него каждый крупный пул-реквест перед тем, как звать коллег. Ревью стали короче, а споры — по делу.</p>
        <p class="letter__sign">{{ letter.name }}<br /><span>{{ letter.role }}, {{ letter.city }}</span></p>
      </section>

      <!-- PRICING: prices like a menu -->
      <section id="media" class="menu" aria-labelledby="menu-h">
        <h2 id="menu-h" class="menu__h">Цены</h2>
        <div class="menu__cols">
          <div v-for="g in [{ name: 'Только текст', tier: 'text', items: text }, { name: 'Файлы и изображения', tier: 'media', items: media }]" :key="g.name" class="menu__group">
            <h3>{{ g.name }}, ₽</h3>
            <RouterLink v-for="p in g.items" :key="p.id" class="menu__item" :to="{ name: 'checkout', params: { plan: p.id }, query: { tier: g.tier } }">
              <span class="menu__row"><span>{{ p.title }}</span><span class="menu__n">{{ formatPrice(p.price) }}</span></span>
              <span class="menu__desc">{{ p.tagline }}</span>
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- FAQ: question index, one answer -->
      <section class="idx" aria-labelledby="idx-h">
        <ul class="idx__list">
          <li><h2 id="idx-h" class="idx__head">Частые вопросы</h2></li>
          <li v-for="(f, i) in faq" :key="f.q">
            <button class="idx__q" :class="{ on: sel === i }" :aria-expanded="sel === i" @click="sel = i" @pointerenter="wide && (sel = i)" @focus="sel = i">
              <i aria-hidden="true" />{{ f.q }}
            </button>
            <p v-if="!wide && sel === i" class="idx__inline">{{ f.a }}</p>
          </li>
        </ul>
        <p v-if="wide" :key="sel" class="idx__pane">{{ faq[sel]!.a }}</p>
      </section>

      <!-- CTA: a plain sentence, one action -->
      <section class="end" aria-labelledby="end-h">
        <h2 id="end-h" class="end__s">Задайте первый вопрос сейчас — это бесплатно и без регистрации.</h2>
        <div class="end__act">
          <RouterLink to="/chat" class="btn">Открыть чат</RouterLink>
          <RouterLink to="/pricing" class="end__link">Тарифы</RouterLink>
        </div>
      </section>

      <QuietFooter />
    </main>
  </div>
</template>

<style scoped>
.v2 {
  --bg: #141512;
  --surface: #20211d;
  --ink: #ece7da;
  --muted: #a9a596;
  --accent: #9db477;
  --accent-ink: #141512;
  --f-display: 'Geologica', 'Golos Text', system-ui, sans-serif;
  --f-text: 'Geologica', 'Golos Text', system-ui, sans-serif;
  --margin: clamp(20px, 2.4vw, 32px);
  --radius: 6px;
  --h-weight: 300;
  --ui-bg: #ece7da;
  --ui-ink: #1b1c18;
  --ui-soft: #5f5d54;
  --ui-bubble: #ddd6c6;
  --ui-accent: #3f5a2a;
  --ui-font: 'Geologica', system-ui, sans-serif;
  --lf-stage: #1b1c18;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font: 300 18px/1.55 var(--f-text);
}
.v2 ::selection {
  background: var(--accent);
  color: var(--accent-ink);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.btn {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 18px;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-ink);
  font: 500 15px var(--f-text);
  transition: transform 0.14s ease, background-color 0.18s;
}
.btn:hover {
  background: #b2c78e;
}
.btn:active {
  transform: scale(0.97);
}

.nav {
  position: absolute;
  inset: 0 0 auto;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  padding: 32px var(--margin);
  font: 400 15px var(--f-text);
}
.nav__mark {
  font-weight: 500;
}
.nav a {
  transition: color 0.18s;
}
.nav__link:hover {
  color: var(--accent);
}

/* doors */
.doors {
  display: grid;
  justify-items: center;
  align-content: start;
  min-height: 100svh;
  padding: 104px var(--margin) 150px;
}
.doors__h {
  margin: 0 0 clamp(48px, 7vh, 96px);
  font: 300 clamp(36px, 3.4vw, 52px) / 1.05 var(--f-display);
  letter-spacing: -0.035em;
  text-align: center;
}
.doors__pair {
  display: flex;
  gap: 80px;
}
.door {
  display: grid;
  gap: 4px;
  width: 280px;
  transition: opacity 0.18s;
}
.door.dim {
  opacity: 0.5;
}
.door__pic {
  height: 373px;
  margin-bottom: 14px;
  overflow: hidden;
  background: var(--ui-bg);
}
.door__pic :deep(.cf) {
  border-radius: 0;
  min-height: 100%;
}
.door__name {
  font-size: 22px;
  font-weight: 400;
}
.door__line {
  font-size: 16px;
  color: var(--muted);
}
.door:hover .door__name {
  color: var(--accent);
}

/* ui fragments (data-ui) */
.file,
.code,
.pick,
.hist {
  height: 100%;
  padding: 20px;
  background: var(--ui-bg);
  color: var(--ui-ink);
  font: 400 15px/1.5 var(--ui-font);
}
.file__chip {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--ui-bubble);
  font-size: 13px;
}
.file__chip b {
  padding: 2px 6px;
  border-radius: 4px;
  background: #b5452c;
  color: #fff;
  font-size: 11px;
}
.file__q {
  margin: 16px 0 10px;
  margin-left: auto;
  width: fit-content;
  max-width: 90%;
  padding: 8px 12px;
  border-radius: 14px 14px 4px 14px;
  background: var(--ui-bubble);
}
.file__a {
  margin: 0;
}
.code p {
  margin: 0 0 12px;
}
.code pre {
  margin: 0;
  padding: 14px;
  border-radius: 8px;
  background: #1b1c18;
  color: #e3dfd2;
  font: 13px/1.6 ui-monospace, Menlo, monospace;
  overflow-x: auto;
}
.pick__row {
  display: grid;
  padding: 12px;
  border-radius: 8px;
}
.pick__row.on {
  background: var(--ui-bubble);
}
.pick__row small {
  color: var(--ui-soft);
}
.hist__d {
  margin: 14px 0 6px;
  font-size: 13px;
  color: var(--ui-soft);
}
.hist__i {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
}
.hist__i.on {
  background: var(--ui-bubble);
}

/* column */
.col {
  padding-inline: var(--margin);
}

/* lit row */
.lit {
  display: grid;
  grid-template-columns: 1fr;
  margin-inline: calc(var(--margin) * -1);
  min-height: 96svh;
  align-content: center;
  padding-block: 80px;
}
.lit__row {
  display: flex;
  align-items: center;
  gap: 26vw;
  padding-inline: calc(50vw - 200px);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.lit__row::-webkit-scrollbar {
  display: none;
}
.lit__panel {
  flex: none;
  width: 400px;
  min-height: 300px;
  scroll-snap-align: center;
  opacity: 0.22;
  transition: opacity 0.3s ease;
  cursor: pointer;
}
.lit__panel.on {
  opacity: 1;
  cursor: default;
}
.lit__panel > * {
  border-radius: 10px;
}
.lit__cap {
  width: min(400px, calc(100% - 2 * var(--margin)));
  margin: 32px auto 0;
}
.lit__name {
  margin: 0;
  font-size: 24px;
  font-weight: 300;
}
.lit__lines {
  margin: 6px 0 0;
  font-size: 16px;
  color: var(--muted);
}

/* letter */
.letter {
  width: min(38ch, 100%);
  margin-left: max(0px, calc(33% - 40px));
  padding-block: 140px;
  font-size: 19px;
}
.letter p {
  margin: 0 0 20px;
}
.letter__open {
  font-size: clamp(26px, 2.4vw, 32px) !important;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.letter__sign {
  margin-top: 40px !important;
  font-size: 16px;
}
.letter__sign span {
  color: var(--muted);
}

/* menu */
.menu {
  display: grid;
  grid-template-columns: 3fr 1fr 8fr;
  padding-block: clamp(100px, 12vw, 180px);
}
.menu__h {
  margin: 0;
  font: 300 clamp(32px, 3vw, 40px) / 1 var(--f-display);
  letter-spacing: -0.03em;
}
.menu__cols {
  grid-column: 3;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
}
.menu__group h3 {
  margin: 0 0 26px;
  font-size: 24px;
  font-weight: 500;
}
.menu__item {
  display: grid;
  margin-bottom: 22px;
}
.menu__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 19px;
  font-weight: 400;
}
.menu__n {
  font-variant-numeric: tabular-nums;
}
.menu__desc {
  max-width: 36ch;
  font-size: 16px;
  color: var(--muted);
}
.menu__item:hover .menu__row {
  color: var(--accent);
}

/* faq index */
.idx {
  display: grid;
  grid-template-columns: 5fr 1fr 6fr;
  align-items: start;
  padding-block: clamp(100px, 12vw, 180px);
}
.idx__list {
  display: grid;
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.idx__head {
  margin: 0;
  font: 400 18px var(--f-text);
  color: var(--muted);
}
.idx__q {
  display: flex;
  align-items: baseline;
  gap: 14px;
  text-align: left;
  font: 400 18px/1.4 var(--f-text);
  color: var(--muted);
  transition: color 0.15s;
}
.idx__q i {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
  transform: translateY(-2px);
}
.idx__q.on {
  color: var(--ink);
}
.idx__q.on i {
  background: var(--accent);
}
.idx__pane {
  grid-column: 3;
  position: sticky;
  top: 120px;
  max-width: 30ch;
  margin: 0;
  font: 300 clamp(24px, 2vw, 28px) / 1.3 var(--f-display);
  animation: fade 0.15s ease;
}
.idx__inline {
  margin: 8px 0 0 22px;
  font-size: 19px;
}

/* end */
.end {
  padding: 30svh 0 0;
}
.end__s {
  max-width: 34ch;
  margin: 0;
  font: 300 22px/1.45 var(--f-text);
}
.end__act {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 24px;
}
.end__link {
  font-size: 15px;
  transition: color 0.18s;
}
.end__link:hover {
  color: var(--accent);
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@media (max-width: 860px) {
  .menu,
  .idx {
    grid-template-columns: 1fr;
  }
  .menu__cols {
    grid-column: 1;
    grid-template-columns: 1fr;
    gap: 40px;
    margin-top: 32px;
  }
  .menu__h {
    font-size: 28px;
  }
  .menu__row {
    font-size: 17px;
  }
  .letter {
    margin-left: 0;
    padding-block: 100px;
    font-size: 17px;
  }
}
@media (max-width: 640px) {
  .nav {
    padding: 20px var(--margin);
  }
  .doors {
    padding-top: 64px;
  }
  .doors__h {
    font-size: 8vw;
  }
  .doors__pair {
    gap: 14px;
  }
  .door {
    width: min(168px, 44vw);
  }
  .door__pic {
    height: calc(min(168px, 44vw) * 4 / 3);
  }
  .door__pic :deep(.cf),
  .door__pic .file {
    font-size: 11px;
  }
  .door__name {
    font-size: 17px;
  }
  .lit {
    min-height: 62svh;
  }
  .lit__row {
    gap: 4vw;
    padding-inline: 7vw;
  }
  .lit__panel {
    width: 86vw;
  }
  .lit__cap {
    margin-left: var(--margin);
  }
  .end {
    padding-top: 20svh;
  }
  .end__s {
    font-size: 18px;
  }
}
</style>
