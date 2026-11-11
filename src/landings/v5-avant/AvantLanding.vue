<script setup lang="ts">
import { ref } from 'vue'
import { faq, reviews } from '@/content/landing'
import { getPlans } from '@/content/plans'
import { useGoogleFont } from '@/lib/fonts'
import { vReveal } from '@/lib/reveal'
import ChatFragment from '../shared/ChatFragment.vue'
import StepPlans from '../shared/StepPlans.vue'

/**
 * Variant 5 — "Dressed as something else": an AI chat sold like a streetwear drop.
 * Idea: the chat screen is the product shot; requests run like a departure board.
 */
useGoogleFont('family=Alumni+Sans:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600')

const week = getPlans('text')[0]!

// ---------- departure board ----------
const ROWS = [
  { name: 'Резюме дизайнера', model: 'Pro', time: '10:02', words: '312 слов', status: 'Готово', tone: 'ok', detail: 'Опыт сжат до шести строк, навыки сгруппированы по задачам, добавлен блок «Результаты в цифрах».' },
  { name: 'Сочинение по Чехову', model: 'Lite', time: '10:04', words: '540 слов', status: 'Готово', tone: 'ok', detail: 'План из пяти частей, тезис про «маленького человека», три цитаты из «Крыжовника» с разбором.' },
  { name: 'Ошибка 500 в Django', model: 'Pro', time: '10:05', words: '128 слов', status: 'Готово', tone: 'ok', detail: 'Причина — миграция не применена на проде. Команда: python manage.py migrate --plan, затем migrate.' },
  { name: 'Тост на свадьбу брата', model: 'Lite', time: '10:07', words: '186 слов', status: 'Пишет', tone: 'live', detail: 'Начинаем с детской истории про велосипед, переходим к знакомству с Катей, финал — короткий и смешной.' },
  { name: 'Бюджет на ноябрь', model: 'Pro', time: '10:08', words: 'таблица', status: 'Готово', tone: 'ok', detail: 'Доход 92 000 ₽: обязательные траты 54 %, накопления 20 %, остальное — по категориям с лимитами.' },
  { name: 'Перевод договора', model: 'Pro', time: '10:09', words: '2 стр.', status: 'Очередь', tone: 'wait', detail: 'Юридический английский → русский, термины сверены с ГК РФ, спорные места помечены.' },
  { name: 'Идеи для Reels', model: 'Lite', time: '10:11', words: '10 идей', status: 'Готово', tone: 'ok', detail: 'Десять сценариев по 15 секунд для кофейни: от «один день бариста» до слепой дегустации.' },
  { name: 'План марафона', model: 'Pro', time: '10:12', words: '16 недель', status: 'Готово', tone: 'ok', detail: 'Четыре тренировки в неделю, длинная пробежка по воскресеньям, разгрузка каждую четвёртую неделю.' },
]
const openRow = ref(3)

// ---------- annotated panel ----------
const NOTES = [
  { id: 'model', side: 'l', top: 3, name: 'Модель', text: 'Lite — быстро. Pro — для кода, учёбы и длинных текстов.' },
  { id: 'hist', side: 'l', top: 30, name: 'Вопрос', text: 'Пишите как человеку, без промптов и команд.' },
  { id: 'answer', side: 'l', top: 58, name: 'Ответ', text: 'Появляется по словам, пока ruAI думает. Можно остановить.' },
  { id: 'copy', side: 'r', top: 18, name: 'Копировать', text: 'Одна кнопка — и текст в буфере обмена.' },
  { id: 'attach', side: 'r', top: 78, name: 'Файлы', text: 'PDF и таблицы в тарифе с медиа.' },
  { id: 'send', side: 'r', top: 90, name: 'Отправить', text: 'Enter — отправить, Shift+Enter — новая строка.' },
]
const focus = ref<string | null>(null)

// ---------- faq cards ----------
const openCard = ref(0)
const TOPICS = ['VPN', 'Оплата', 'Отмена', 'Тарифы', 'Приватность', 'Бесплатно']

const lead = reviews[4]!
const corner = [reviews[0]!, reviews[2]!]
</script>

<template>
  <div class="v5">
    <header class="nav">
      <RouterLink to="/" class="nav__mark">RUAI</RouterLink>
      <nav class="nav__links" aria-label="Разделы">
        <a href="#board">Табло</a>
        <a href="#panel">Интерфейс</a>
        <a href="#price">Цены</a>
      </nav>
      <RouterLink to="/chat" class="nav__act">Открыть чат</RouterLink>
    </header>

    <!-- HERO: shouted headline, rising picture -->
    <section class="hero" aria-labelledby="h1">
      <h1 id="h1" class="hero__h">
        <span class="sr-only">ruAI — </span>
        <span class="mask"><span class="mask__l">Думай</span></span>
        <span class="mask"><span class="mask__l mask__l--2">по-русски</span></span>
      </h1>
      <div class="hero__pic">
        <ChatFragment
          title="ruAI Pro"
          :messages="[
            { role: 'user', text: 'Придумай название для кофейни у моря' },
            { role: 'assistant', text: '«Прибой и пенка», «Солёная пенка», «Бриз-бар». Мне больше всего нравится первое: звучит тепло и легко запоминается.' },
            { role: 'user', text: 'Беру первое. Нужен слоган' },
          ]"
          typing
        />
      </div>
      <p class="hero__sub">Нейросеть на русском без VPN. Пишет, объясняет и считает. Оплата картой МИР или через СБП.</p>
      <p class="hero__fact">Неделя — {{ week.price }} ₽</p>
    </section>

    <!-- SHOWCASE: rows as a board -->
    <section id="board" class="board" aria-labelledby="board-h">
      <h2 id="board-h" class="sr-only">Табло запросов</h2>
      <div class="board__rows" data-ui>
        <button
          v-for="(r, i) in ROWS"
          :key="r.name"
          class="row"
          :class="{ open: openRow === i }"
          :aria-expanded="openRow === i"
          @click="openRow = i"
        >
          <span class="row__name">{{ r.name }}</span>
          <span class="row__f">{{ r.model }}</span>
          <span class="row__f">{{ r.time }}</span>
          <span class="row__f">{{ r.words }}</span>
          <span class="row__st" :class="`st--${r.tone}`">{{ r.status }}</span>
          <span v-if="openRow === i" class="row__detail">{{ r.detail }}</span>
        </button>
      </div>
    </section>

    <!-- FEATURES: panel with margin notes -->
    <section id="panel" class="plate" aria-labelledby="plate-h">
      <h2 id="plate-h" class="plate__h">Интерфейс без лишнего</h2>
      <div class="plate__stage">
        <ul class="plate__notes plate__notes--l">
          <li v-for="n in NOTES.filter((x) => x.side === 'l')" :key="n.id" :style="{ top: `${n.top}%` }">
            <button class="note" @pointerenter="focus = n.id" @pointerleave="focus = null" @focus="focus = n.id" @blur="focus = null">
              <b>{{ n.name }}</b>{{ n.text }}
            </button>
          </li>
        </ul>
        <div class="ui" data-ui :class="{ dimmed: focus }">
          <div class="ui__part ui__top" :class="{ lit: focus === 'model' }"><b>ruAI Pro</b><span>⌄</span></div>
          <div class="ui__part ui__q" :class="{ lit: focus === 'hist' }">Как объяснить ребёнку, почему небо голубое?</div>
          <div class="ui__part ui__a" :class="{ lit: focus === 'answer' }">
            Солнечный свет — это смесь всех цветов. Когда он проходит через воздух, синий рассеивается сильнее остальных и приходит к нам со всех сторон неба. Поэтому днём кажется, что голубое всё небо.
          </div>
          <div class="ui__part ui__copy" :class="{ lit: focus === 'copy' }">Копировать</div>
          <div class="ui__spacer" />
          <div class="ui__bottom">
            <span class="ui__part ui__attach" :class="{ lit: focus === 'attach' }">＋ Файл</span>
            <span class="ui__in">Спросите ruAI</span>
            <span class="ui__part ui__send" :class="{ lit: focus === 'send' }">↑</span>
          </div>
        </div>
        <ul class="plate__notes plate__notes--r">
          <li v-for="n in NOTES.filter((x) => x.side === 'r')" :key="n.id" :style="{ top: `${n.top}%` }">
            <button class="note" @pointerenter="focus = n.id" @pointerleave="focus = null" @focus="focus = n.id" @blur="focus = null">
              <b>{{ n.name }}</b>{{ n.text }}
            </button>
          </li>
        </ul>
      </div>
    </section>

    <!-- HOW: itinerary on a slip -->
    <section class="slip-sec" aria-labelledby="slip-h">
      <div class="slip-sec__text">
        <h2 id="slip-h" class="slip-sec__h">Чек одного вопроса</h2>
        <p>Так выглядит обычная задача: от открытия сайта до готового текста — около минуты.</p>
      </div>
      <div class="slip" data-ui v-reveal>
        <p class="slip__title">RUAI · ЧЕК № 0001</p>
        <h3>Открытие</h3>
        <p class="slip__row"><span>Сайт открыт без VPN</span><i /><span>0:05</span></p>
        <h3>Вопрос</h3>
        <p class="slip__row"><span>Задача своими словами</span><i /><span>0:20</span></p>
        <p class="slip__row"><span>Уточнение тона</span><i /><span>0:10</span></p>
        <h3>Ответ</h3>
        <p class="slip__row"><span>Первое слово ответа</span><i /><span>0:01</span></p>
        <p class="slip__row"><span>Ответ целиком</span><i /><span>0:09</span></p>
        <p class="slip__row"><span>Правка по просьбе</span><i /><span>0:30</span></p>
        <p class="slip__total"><span>Готовый текст</span><span>1:15</span></p>
      </div>
    </section>

    <!-- TESTIMONIAL: lead quote, corner quotes -->
    <section class="quotes" aria-labelledby="quotes-h">
      <h2 id="quotes-h" class="sr-only">Отзывы</h2>
      <blockquote class="quotes__lead" v-reveal>
        <p>«{{ lead.text }}»</p>
        <footer>{{ lead.name }}, {{ lead.role }}</footer>
      </blockquote>
      <blockquote v-for="(c, i) in corner" :key="c.name" class="quotes__small" :class="`quotes__small--${i}`" v-reveal="120 * (i + 1)">
        <p>«{{ c.text }}»</p>
        <footer>{{ c.name }}, {{ c.city }}</footer>
      </blockquote>
    </section>

    <!-- PRICING -->
    <div id="price" class="price-wrap"><StepPlans title="Цены" /></div>

    <!-- FAQ: tabbed index cards -->
    <section class="cards" aria-labelledby="cards-h">
      <h2 id="cards-h" class="cards__h">Вопросы</h2>
      <div class="cards__stack">
        <div v-for="(f, i) in faq" :key="f.q" class="card" :class="[`card--c${i % 3}`, { open: openCard === i }]" :style="{ '--i': i }">
          <button class="card__head" :aria-expanded="openCard === i" @click="openCard = i">
            <span class="card__tab">{{ TOPICS[i] }}</span>
            <span class="card__q">{{ f.q }}</span>
          </button>
          <p v-if="openCard === i" class="card__a">{{ f.a }}</p>
        </div>
      </div>
    </section>

    <!-- CTA: one word is the button -->
    <RouterLink to="/chat" class="word" aria-label="Спросить ruAI — открыть чат">
      <span class="word__note">Откроется чат. Первый вопрос — бесплатно.</span>
      <svg class="word__arrow" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 36 36 12M16 12h20v20" fill="none" stroke="currentColor" stroke-width="4" /></svg>
      <span class="word__w">Спросить</span>
    </RouterLink>

    <!-- FOOTER: columns above, wordmark below -->
    <footer class="foot">
      <div class="foot__cols">
        <div><b>ruAI</b><span>Нейросеть без VPN</span><span>Россия</span></div>
        <div><b>Разделы</b><RouterLink to="/chat">Чат</RouterLink><RouterLink to="/pricing">Тарифы</RouterLink></div>
        <div><b>Оплата</b><span>МИР, СБП</span><span>SberPay</span></div>
        <div><b>Поддержка</b><a href="mailto:support@ruai.example">support@ruai.example</a><span>9:00–21:00 МСК</span></div>
      </div>
      <svg class="foot__mark" viewBox="0 0 400 104" role="img" aria-label="ruAI"><text x="0" y="100" textLength="400" lengthAdjust="spacingAndGlyphs">RUAI</text></svg>
      <p class="foot__legal">© {{ new Date().getFullYear() }} ruAI. Оферта · Конфиденциальность</p>
    </footer>
  </div>
</template>

<style scoped>
.v5 {
  --char: #191919;
  --char-2: #242424;
  --red: #d71e1e;
  --blue: #1e4bd7;
  --teal: #0c7866;
  --yellow: #ffe927;
  --paper: #f2f0eb;
  --f-display: 'Alumni Sans', 'Oswald', 'Arial Narrow', sans-serif;
  --f-text: 'IBM Plex Sans', 'Golos Text', system-ui, sans-serif;
  --margin: clamp(12px, 2vw, 28px);
  --radius: 0;
  --h-weight: 800;
  --h-case: uppercase;
  --plan-1: var(--red);
  --plan-1-ink: #fff;
  --plan-2: var(--blue);
  --plan-2-ink: #fff;
  --plan-3: var(--teal);
  --plan-3-ink: #fff;
  --ui-bg: #111;
  --ui-ink: #f2f0eb;
  --ui-soft: #9a9a9a;
  --ui-bubble: #2a2a2a;
  --ui-accent: var(--yellow);
  --ui-accent-ink: #111;
  --ui-font: 'IBM Plex Sans', system-ui, sans-serif;
  background: var(--char);
  color: #fff;
  font: 400 17px/1.5 var(--f-text);
  overflow-x: clip;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* nav */
.nav {
  position: absolute;
  inset: 0 0 auto;
  z-index: 5;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 24px var(--margin);
  color: #111;
  font-size: 15px;
}
.nav__mark {
  font: 800 30px/1 var(--f-display);
  letter-spacing: 0.01em;
}
.nav__links {
  display: flex;
  gap: 28px;
}
.nav a {
  transition: opacity 0.18s;
}
.nav a:hover {
  opacity: 0.6;
}
.nav__act {
  justify-self: end;
  padding: 10px 16px;
  background: #111;
  color: #fff;
  font-weight: 500;
}

/* hero */
.hero {
  position: relative;
  height: 100svh;
  min-height: 680px;
  overflow: hidden;
  background: var(--paper);
  color: #111;
}
.hero__h {
  position: absolute;
  top: 11%;
  left: 0;
  right: 0;
  margin: 0;
  text-align: center;
  font: 800 clamp(88px, 11.4vw, 176px) / 0.86 var(--f-display);
  letter-spacing: -0.01em;
  text-transform: uppercase;
}
.mask {
  display: block;
  overflow: hidden;
}
.mask__l {
  display: block;
  animation: maskUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.mask__l--2 {
  animation-delay: 0.11s;
}
.hero__pic {
  position: absolute;
  left: 50%;
  top: calc(11% + clamp(88px, 11.4vw, 176px) * 1.72 - 1.2vw);
  width: max(27vw, 320px);
  aspect-ratio: 3 / 4;
  transform: translateX(-50%);
  animation: picUp 1.1s 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.hero__pic :deep(.cf) {
  height: 100%;
  border-radius: 0;
  font-size: 15px;
}
.hero__sub,
.hero__fact {
  position: absolute;
  bottom: 32px;
  margin: 0;
  font-size: 17px;
  animation: fadeUp 0.6s 0.7s ease both;
}
.hero__sub {
  left: var(--margin);
  width: 280px;
}
.hero__fact {
  right: var(--margin);
  font-weight: 600;
}

/* board */
.board {
  position: relative;
  height: 96svh;
  min-height: 700px;
  overflow: hidden;
  padding-inline: var(--margin);
}
.board__rows {
  position: absolute;
  inset: -36px var(--margin);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: grid;
  grid-template-columns: 5fr 1fr 2fr 2fr 2fr;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  padding: 0 20px;
  background: var(--char-2);
  color: #fff;
  font: 500 clamp(20px, 2vw, 30px) / 1.1 var(--f-display);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  text-align: left;
  font-variant-numeric: tabular-nums;
  transition: background-color 0.2s;
}
.row:hover {
  background: #2e2e2e;
}
.row.open {
  min-height: 216px;
  align-content: start;
  padding-top: 22px;
  background: var(--teal);
}
.row.open .row__name {
  font-size: clamp(36px, 4vw, 64px);
}
.row__st {
  justify-self: end;
  padding: 6px 12px;
  font-size: 0.85em;
}
.st--ok {
  background: #2fb36a;
  color: #111;
}
.st--live {
  background: var(--yellow);
  color: #111;
}
.st--wait {
  background: #9a9a9a;
  color: #111;
}
.row__detail {
  grid-column: 1 / -1;
  max-width: 64ch;
  margin-top: 16px;
  font: 400 17px/1.5 var(--f-text);
  letter-spacing: 0;
  text-transform: none;
}

/* plate */
.plate {
  padding: clamp(120px, 14vw, 200px) var(--margin);
}
.plate__stage {
  position: relative;
  display: grid;
  grid-template-columns: 4fr 4fr 4fr;
  gap: 24px;
}
.plate__h {
  position: absolute;
  margin: 0;
  width: 30%;
  text-align: right;
  font: 800 clamp(36px, 3.4vw, 52px) / 0.95 var(--f-display);
  text-transform: uppercase;
}
.plate__notes {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
.plate__notes li {
  position: absolute;
  width: 24ch;
}
.plate__notes--l li {
  right: 0;
  text-align: right;
}
.plate__notes--l {
  margin-top: 80px;
}
.note {
  display: grid;
  gap: 4px;
  text-align: inherit;
  font: 400 15px/1.45 var(--f-text);
  color: #b5b5b5;
  transition: color 0.15s;
}
.note b {
  color: #fff;
  font-size: 18px;
  font-weight: 500;
}
.note:hover,
.note:focus-visible {
  color: #fff;
}
.note:hover b {
  color: var(--yellow);
}
.ui {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 380px;
  height: 680px;
  justify-self: center;
  padding: 18px;
  background: var(--paper);
  color: #111;
  font: 400 15px/1.5 var(--ui-font);
}
.ui__part {
  transition: opacity 0.2s;
}
.ui.dimmed .ui__part:not(.lit) {
  opacity: 0.3;
}
.ui__top {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}
.ui__q {
  align-self: flex-end;
  max-width: 80%;
  padding: 8px 14px;
  background: #e2dfd8;
  border-radius: 16px 16px 4px 16px;
}
.ui__copy {
  width: fit-content;
  padding: 4px 10px;
  background: #e2dfd8;
  font-size: 13px;
}
.ui__spacer {
  flex: 1;
}
.ui__bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: #e2dfd8;
  border-radius: 999px;
}
.ui__attach {
  padding: 6px 10px;
  font-size: 13px;
}
.ui__in {
  flex: 1;
  color: #777;
}
.ui__send {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #111;
  color: var(--yellow);
}

/* slip */
.slip-sec {
  display: grid;
  grid-template-columns: 5fr 1fr 5fr 1fr;
  align-items: start;
  padding: clamp(120px, 14vw, 200px) var(--margin);
  background: var(--red);
}
.slip-sec__h {
  margin: 0;
  font: 800 clamp(48px, 4.6vw, 72px) / 0.92 var(--f-display);
  text-transform: uppercase;
}
.slip-sec__text p {
  max-width: 30ch;
  margin: 16px 0 0;
}
.slip {
  grid-column: 3;
  width: min(460px, 100%);
  padding: 28px 28px 52px;
  background: var(--paper);
  color: #111;
  font: 400 16px/1.5 var(--f-text);
  font-variant-numeric: tabular-nums;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 95% calc(100% - 12px), 90% 100%, 85% calc(100% - 12px), 80% 100%, 75% calc(100% - 12px), 70% 100%, 65% calc(100% - 12px), 60% 100%, 55% calc(100% - 12px), 50% 100%, 45% calc(100% - 12px), 40% 100%, 35% calc(100% - 12px), 30% 100%, 25% calc(100% - 12px), 20% 100%, 15% calc(100% - 12px), 10% 100%, 5% calc(100% - 12px), 0 100%);
}
.slip__title {
  margin: 0;
  font-weight: 600;
  text-align: center;
}
.slip h3 {
  margin: 28px 0 8px;
  font-size: 16px;
  font-weight: 600;
}
.slip__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 6px;
}
.slip__row i {
  flex: 1;
  height: 4px;
  background: radial-gradient(circle, #111 1.5px, transparent 2px) 0 50% / 8px 4px repeat-x;
}
.slip__total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  margin: 24px -28px 0;
  padding: 0 28px;
  background: #111;
  color: var(--paper);
  font-weight: 600;
}

/* quotes */
.quotes {
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: auto 1fr auto;
  min-height: 100svh;
  padding: 120px var(--margin);
  background: var(--yellow);
  color: #111;
}
.quotes__lead {
  grid-column: 2 / 11;
  grid-row: 2;
  align-self: center;
  margin: 0;
}
.quotes__lead p {
  margin: 0;
  font: 800 clamp(48px, 6vw, 96px) / 0.95 var(--f-display);
  text-transform: uppercase;
}
.quotes__lead footer,
.quotes__small footer {
  margin-top: 16px;
  font-size: 16px;
}
.quotes__small {
  margin: 0;
  max-width: 32ch;
  font-size: 17px;
}
.quotes__small p {
  margin: 0;
}
.quotes__small--0 {
  grid-column: 1 / 5;
  grid-row: 1;
}
.quotes__small--1 {
  grid-column: 9 / 13;
  grid-row: 3;
  justify-self: end;
}

.price-wrap {
  padding-inline: var(--margin);
}

/* cards */
.cards {
  padding: clamp(120px, 14vw, 200px) var(--margin);
}
.cards__h {
  margin: 0 0 40px;
  padding-left: 16.66%;
  font: 800 clamp(48px, 4.4vw, 72px) / 0.9 var(--f-display);
  text-transform: uppercase;
}
.cards__stack {
  width: 66.66%;
  margin-left: 16.66%;
}
.card {
  position: relative;
  margin-top: -16px;
  padding-top: 40px;
  color: #fff;
  clip-path: polygon(calc(var(--i) * 150px) 0, calc(var(--i) * 150px + 200px) 0, calc(var(--i) * 150px + 200px) 40px, 100% 40px, 100% 100%, 0 100%, 0 40px, calc(var(--i) * 150px) 40px);
  background: var(--c);
  transition: transform 0.2s ease;
}
.card:hover {
  transform: translateY(-4px);
}
.card--c0 {
  --c: var(--blue);
}
.card--c1 {
  --c: var(--teal);
}
.card--c2 {
  --c: var(--red);
}
.card__head {
  display: block;
  width: 100%;
  min-height: 96px;
  padding: 0 24px 20px;
  text-align: left;
  color: inherit;
}
.card__tab {
  position: absolute;
  top: 10px;
  left: calc(var(--i) * 150px + 20px);
  font: 500 16px var(--f-text);
}
.card__q {
  display: block;
  padding-top: 16px;
  font: 500 20px/1.3 var(--f-text);
}
.card__a {
  max-width: 50ch;
  margin: 0;
  padding: 0 24px 32px;
  font-size: 17px;
}

/* cta word */
.word {
  position: relative;
  display: block;
  min-height: 60svh;
  padding: 24px var(--margin);
  background: var(--teal);
  color: #fff;
  overflow: hidden;
  transition: background-color 0.01s, color 0.01s;
}
.word:hover,
.word:focus-visible {
  background: #fff;
  color: var(--teal);
}
.word__note {
  display: block;
  max-width: 24ch;
  font-size: 20px;
}
.word__arrow {
  position: absolute;
  top: 24px;
  right: var(--margin);
  width: 48px;
  height: 48px;
  transition: transform 0.25s ease;
}
.word:hover .word__arrow {
  transform: translate(6px, -6px);
}
.word__w {
  position: absolute;
  left: var(--margin);
  bottom: 24px;
  font: 800 clamp(120px, 24vw, 420px) / 0.78 var(--f-display);
  text-transform: uppercase;
  letter-spacing: -0.01em;
}

/* footer */
.foot {
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  min-height: 100svh;
  padding: 40px var(--margin) 20px;
  background: var(--paper);
  color: #111;
}
.foot__cols {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  font-size: 15px;
}
.foot__cols div {
  display: grid;
  align-content: start;
  gap: 4px;
  color: #555;
}
.foot__cols b {
  color: #111;
  font-weight: 600;
}
.foot__cols a:hover {
  color: var(--red);
}
.foot__mark {
  grid-row: 3;
  width: 100%;
  height: auto;
  font: 800 135px var(--f-display);
  fill: #111;
}
.foot__legal {
  margin: 20px 0 0;
  font-size: 13px;
  color: #555;
}

@keyframes maskUp {
  from {
    transform: translateY(100%);
  }
}
@keyframes picUp {
  from {
    transform: translate(-50%, 18%);
    opacity: 0;
  }
}
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@media (max-width: 860px) {
  .nav {
    grid-template-columns: 1fr auto;
  }
  .nav__links {
    display: none;
  }
  .hero__h {
    top: 13%;
    font-size: 17vw;
  }
  .hero__pic {
    top: calc(13% + 17vw * 1.72);
    width: 64vw;
  }
  .hero__sub {
    display: none;
  }
  .hero__fact {
    bottom: auto;
    top: 76px;
    right: var(--margin);
    font-size: 15px;
  }
  .row {
    grid-template-columns: 1fr auto;
    min-height: 64px;
    font-size: 20px;
    padding: 0 14px;
  }
  .row__f {
    display: none;
  }
  .row.open .row__f {
    display: block;
    grid-column: 1 / -1;
    font: 400 16px var(--f-text);
    text-transform: none;
  }
  .row.open {
    min-height: 200px;
  }
  .plate__stage {
    grid-template-columns: 1fr;
  }
  .plate__h {
    position: static;
    width: auto;
    text-align: left;
    margin-bottom: 24px;
    font-size: 26px;
  }
  .plate__notes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 0 !important;
  }
  .plate__notes li {
    position: static;
    width: auto;
    text-align: left !important;
  }
  .ui {
    width: 100%;
    height: auto;
    min-height: 520px;
    order: -1;
  }
  .slip-sec {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .slip {
    grid-column: 1;
  }
  .quotes {
    display: flex;
    flex-direction: column;
    gap: 48px;
  }
  .quotes__lead {
    order: -1;
  }
  .quotes__lead p {
    font-size: 11vw;
  }
  .quotes__small--1 {
    margin-left: 25%;
  }
  .cards__h {
    padding-left: 0;
    font-size: 9vw;
  }
  .cards__stack {
    width: 100%;
    margin-left: 0;
  }
  .card {
    clip-path: polygon(calc(var(--i) * 48px) 0, calc(var(--i) * 48px + 120px) 0, calc(var(--i) * 48px + 120px) 40px, 100% 40px, 100% 100%, 0 100%, 0 40px, calc(var(--i) * 48px) 40px);
  }
  .card__tab {
    left: calc(var(--i) * 48px + 12px);
    font-size: 14px;
  }
  .word {
    min-height: 46svh;
  }
  .word__w {
    font-size: 26vw;
  }
  .word__note {
    font-size: 17px;
  }
  .word__arrow {
    width: 32px;
    height: 32px;
  }
  .foot__cols {
    grid-template-columns: 1fr 1fr;
    row-gap: 32px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mask__l,
  .hero__pic,
  .hero__sub,
  .hero__fact {
    animation: none;
  }
}
</style>
