<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { reviews, stages } from '@/content/landing'
import { useGoogleFont } from '@/lib/fonts'
import { vReveal } from '@/lib/reveal'
import SentenceCta from '../shared/SentenceCta.vue'
import StepPlans from '../shared/StepPlans.vue'
import TileFaq from '../shared/TileFaq.vue'

/**
 * Variant 4 — "Colour chapters".
 * Idea: every kind of text ruAI writes for you gets its own chapter colour, like folders on a desk.
 */
useGoogleFont('family=Jost:wght@400;500;700')

// ---------- chapter-aware corner header ----------
const ink = ref('#ffffff')
let io: IntersectionObserver | null = null
onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) ink.value = (e.target as HTMLElement).dataset.ink ?? '#fff'
    },
    { rootMargin: '0px 0px -94% 0px' },
  )
  document.querySelectorAll<HTMLElement>('.v4 [data-ink]').forEach((el) => io?.observe(el))
})
onBeforeUnmount(() => io?.disconnect())

// ---------- output index ----------
const OUTPUTS = [
  {
    name: 'Письмо',
    width: 440,
    kind: 'email',
    head: ['Кому: hr@company.ru', 'Тема: Отпуск 14–27 июля'],
    body: ['Здравствуйте, Ирина Сергеевна!', 'Прошу согласовать ежегодный отпуск с 14 по 27 июля (14 календарных дней).', 'Текущие задачи передам Алексею Смирнову до 10 июля.', 'С уважением,\nАнна Котова'],
  },
  {
    name: 'Конспект',
    width: 560,
    kind: 'doc',
    head: ['Физика · Законы Ньютона', 'Лекция 4 · 12 ноября'],
    body: ['1-й закон. Тело покоится или движется равномерно, пока на него не подействует сила.', '2-й закон. F = m · a. Сила 10 Н разгоняет тело массой 2 кг с ускорением 5 м/с².', '3-й закон. Силы взаимодействия равны по модулю и противоположны по направлению.', 'К экзамену: решить задачи 4.12–4.18.'],
  },
  {
    name: 'План поездки',
    width: 560,
    kind: 'doc',
    head: ['Казань · 2 дня', 'Бюджет на двоих ≈ 14 600 ₽'],
    body: ['Суббота, 10:00 — Кремль и мечеть Кул-Шариф (вход свободный).', 'Суббота, 14:00 — обед на Баумана, 1 800 ₽.', 'Воскресенье, 11:00 — Старо-Татарская слобода, музей чак-чака, 800 ₽.', 'Жильё: 2 ночи в центре — 12 000 ₽.'],
  },
  {
    name: 'Пост',
    width: 300,
    kind: 'post',
    head: ['Telegram · канал «Кофе и код»', '9:41'],
    body: ['Зачем джуну ревью, если код и так работает?', 'Потому что «работает» — это про сегодня. Ревью — про то, что код поймут через полгода.', '#разработка #советы'],
  },
]
const out = ref(0)
const sheet = computed(() => OUTPUTS[out.value]!)

// ---------- close-ups ----------
const proOn = ref(true)

const total = stages.reduce((s, x) => s + x.seconds, 0)
const SEG = ['#1423b8', '#000000', '#f7dd47', '#e9479f']
const SEG_INK = ['#fff', '#fff', '#000', '#000']

const q = reviews[2]!
</script>

<template>
  <div class="v4">
    <header class="corner" :style="{ color: ink }">
      <RouterLink to="/" class="corner__mark">ruAI</RouterLink>
      <RouterLink to="/chat" class="corner__act">Открыть чат</RouterLink>
    </header>

    <!-- HERO: colour field, two-ink statement -->
    <section class="ch ch--blue hero" data-ink="#ffffff" aria-labelledby="h1">
      <h1 id="h1" class="hero__h">
        <span class="hero__l1">ruAI</span>
        <span class="hero__l2">без VPN</span>
      </h1>
      <p class="hero__sub">Нейросеть на русском для писем, учёбы и кода. Открывается из России напрямую, оплата картой МИР или через СБП — от 388 ₽ в неделю.</p>
    </section>

    <!-- SHOWCASE: output index, live sheet -->
    <section class="ch ch--black outs" data-ink="#ffffff" aria-labelledby="outs-h">
      <h2 id="outs-h" class="sr-only">Что пишет ruAI</h2>
      <div class="outs__names" role="tablist" aria-label="Примеры результатов">
        <button
          v-for="(o, i) in OUTPUTS"
          :key="o.name"
          role="tab"
          :aria-selected="out === i"
          class="outs__name"
          :class="{ on: out === i }"
          @click="out = i"
        >{{ o.name }}</button>
      </div>
      <div class="outs__stage">
        <Transition name="xf" mode="out-in">
          <article :key="sheet.name" class="sheet" :class="`sheet--${sheet.kind}`" :style="{ width: `${sheet.width}px` }" data-ui role="tabpanel">
            <header class="sheet__head">
              <span v-for="h in sheet.head" :key="h">{{ h }}</span>
            </header>
            <p v-for="b in sheet.body" :key="b">{{ b }}</p>
            <footer class="sheet__foot">Написано ruAI за 6 секунд</footer>
          </article>
        </Transition>
      </div>
    </section>

    <!-- FEATURES: close-ups on a board -->
    <section class="ch ch--yellow board" data-ink="#000000" aria-labelledby="board-h">
      <div class="board__grid">
        <div class="tile tile--head">
          <h2 id="board-h">Всё, что нужно, крупным планом</h2>
        </div>
        <div class="tile tile--big tile--ink" data-ui>
          <div class="z z-model">
            <span class="z-model__row">ruAI Lite</span>
            <span class="z-model__row on">ruAI Pro ✓</span>
          </div>
          <p class="cap"><b>Две модели</b> Lite — быстро, Pro — для кода и сложных задач</p>
        </div>
        <div class="tile tile--pink" data-ui>
          <span class="z z-pay"><b>МИР</b><b>СБП</b></span>
          <p class="cap"><b>Оплата из России</b> Карты банков РФ, СБП, SberPay</p>
        </div>
        <div class="tile tile--blue" data-ui>
          <button class="z z-toggle" role="switch" :aria-checked="proOn" aria-label="Длинная память" @click="proOn = !proOn"><span /></button>
          <p class="cap"><b>Длинная память</b> {{ proOn ? 'Помнит весь диалог' : 'Только последние сообщения' }}</p>
        </div>
        <div class="tile tile--white" data-ui>
          <span class="z z-status"><i /> Подключено напрямую</span>
          <p class="cap"><b>Без VPN</b> Ноль прокси и настроек</p>
        </div>
        <div class="tile tile--big tile--blue" data-ui>
          <pre class="z z-code"><code>user = users.get(id)
if user is None:
    return 404</code></pre>
          <p class="cap"><b>Код</b> Объяснит ошибку и предложит правку</p>
        </div>
      </div>
    </section>

    <!-- HOW: stages as one bar -->
    <section class="ch ch--pink bar" data-ink="#000000" aria-labelledby="bar-h">
      <h2 id="bar-h" class="bar__h">Минута от вопроса до ответа</h2>
      <div class="bar__row" data-ui>
        <div v-for="(s, i) in stages" :key="s.name" class="bar__seg" :style="{ flexGrow: Math.max(s.seconds, total * 0.12), background: SEG[i], color: SEG_INK[i] }" v-reveal="i * 90">
          <span class="bar__dur">{{ s.duration }}</span>
        </div>
      </div>
      <div class="bar__row bar__row--clauses">
        <p v-for="s in stages" :key="s.name" :style="{ flexGrow: Math.max(s.seconds, total * 0.12) }">{{ s.word }} {{ s.clause }}</p>
      </div>
    </section>

    <!-- TESTIMONIAL: name block, quote block -->
    <section class="say" data-ink="#ffffff" aria-labelledby="say-h">
      <h2 id="say-h" class="sr-only">Отзыв</h2>
      <div class="say__who">
        <b>{{ q.name }}</b>
        <span>{{ q.role }}, {{ q.city }}</span>
      </div>
      <blockquote class="say__q" v-reveal>«{{ q.text }}»</blockquote>
    </section>

    <!-- PRICING -->
    <div class="ch ch--black" data-ink="#ffffff">
      <StepPlans title="Платите за время" />
    </div>

    <!-- FAQ -->
    <div class="ch ch--blue" data-ink="#ffffff">
      <TileFaq title="Вопросы" />
    </div>

    <!-- CTA -->
    <div class="ch ch--yellow" data-ink="#000000">
      <SentenceCta before="Спросите ruAI про" after="и прочитайте ответ" verb="сейчас" placeholder="ЕГЭ" />
    </div>

    <!-- FOOTER: the mark, built large -->
    <footer class="ch ch--black foot" data-ink="#ffffff">
      <div class="mark" aria-label="ruAI">
        <span v-for="(l, i) in ['r', 'u', 'A', 'I']" :key="l" class="mark__b" :class="`mark__b--${i}`" aria-hidden="true">{{ l }}</span>
      </div>
      <div class="foot__cols">
        <nav aria-label="Продукт"><b>Продукт</b><RouterLink to="/chat">Чат</RouterLink><RouterLink to="/pricing">Тарифы</RouterLink></nav>
        <nav aria-label="Оплата"><b>Оплата</b><span>Карты МИР</span><span>СБП, SberPay</span></nav>
        <nav aria-label="Помощь"><b>Помощь</b><a href="#" @click.prevent>Вопросы</a><a href="#" @click.prevent>Оферта</a></nav>
        <div class="foot__contact"><b>Поддержка</b><a href="mailto:support@ruai.example">support@ruai.example</a><span>Ежедневно 9:00–21:00 МСК</span></div>
      </div>
      <div class="foot__last">
        <span>© {{ new Date().getFullYear() }} ruAI</span>
        <RouterLink to="/chat" class="foot__btn">Открыть чат</RouterLink>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.v4 {
  --blue: #1423b8;
  --black: #000000;
  --yellow: #f7dd47;
  --pink: #e9479f;
  --green: #1fc27a;
  --pale: #b4bcf0;
  --f-display: 'Jost', 'Golos Text', system-ui, sans-serif;
  --f-text: 'Jost', 'Golos Text', system-ui, sans-serif;
  --margin: clamp(16px, 3vw, 44px);
  --radius: 0;
  --h-weight: 700;
  --h-case: uppercase;
  --plan-1: var(--pink);
  --plan-1-ink: #000;
  --plan-2: var(--yellow);
  --plan-2-ink: #000;
  --plan-3: var(--blue);
  --plan-3-ink: #fff;
  font: 400 18px/1.5 var(--f-text);
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
.ch {
  min-height: 90svh;
  padding: 0 var(--margin);
}
.ch--blue {
  --bg: var(--blue);
  --ink: #fff;
  --muted: var(--pale);
  --surface: #2232c8;
  --accent: var(--green);
  --accent-ink: #000;
  background: var(--blue);
  color: #fff;
}
.ch--black {
  --bg: #000;
  --ink: #fff;
  --muted: #a3a3a3;
  --surface: #1c1c1c;
  --accent: var(--green);
  --accent-ink: #000;
  background: #000;
  color: #fff;
}
.ch--yellow {
  --bg: var(--yellow);
  --ink: #000;
  --muted: #4d4413;
  --surface: #ead03a;
  --accent: #000;
  --accent-ink: var(--yellow);
  background: var(--yellow);
  color: #000;
}
.ch--pink {
  --ink: #000;
  --muted: #3d0f27;
  background: var(--pink);
  color: #000;
}

/* corner header */
.corner {
  position: fixed;
  inset: 0 0 auto;
  z-index: 30;
  display: flex;
  justify-content: space-between;
  padding: max(16px, env(safe-area-inset-top)) var(--margin) 0;
  font: 500 15px var(--f-text);
  pointer-events: none;
  transition: color 0.3s ease;
}
.corner a {
  pointer-events: auto;
}
.corner__mark {
  font-weight: 700;
  letter-spacing: -0.02em;
}
.corner__act {
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-thickness: 2px;
}

/* hero */
.hero {
  position: relative;
  min-height: 100svh;
}
.hero__h {
  position: absolute;
  top: 15%;
  left: var(--margin);
  right: var(--margin);
  margin: 0;
  font: 700 clamp(96px, 14vw, 220px) / 0.82 var(--f-display);
  letter-spacing: -0.03em;
  text-transform: uppercase;
}
.hero__h span {
  display: block;
  animation: rise 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.hero__l1 {
  color: var(--pale);
}
.hero__l2 {
  color: #fff;
  animation-delay: 0.11s !important;
}
.hero__sub {
  position: absolute;
  right: var(--margin);
  bottom: 40px;
  width: max(24vw, 300px);
  margin: 0;
  font-size: 17px;
  color: var(--pale);
  text-align: right;
  animation: rise 0.9s 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

/* outputs */
.outs {
  display: grid;
  grid-template-columns: 5fr 1fr 6fr;
  align-items: center;
  min-height: 100svh;
  padding-block: 80px;
}
.outs__names {
  display: grid;
  justify-items: start;
}
.outs__name {
  font: 700 clamp(36px, 4vw, 64px) / 1.1 var(--f-display);
  letter-spacing: -0.02em;
  text-transform: uppercase;
  color: #6f6f6f;
  transition: color 0.2s;
}
.outs__name:hover,
.outs__name.on {
  color: #fff;
}
.outs__stage {
  grid-column: 3;
  position: relative;
  height: 88svh;
  padding: 72px 0 0 64px;
  background: #1c1c1c;
  overflow: hidden;
  margin-right: calc(var(--margin) * -1);
}
.sheet {
  max-width: calc(100% - 32px);
  min-height: 120%;
  padding: 32px;
  background: #fbfaf6;
  color: #111;
  font: 400 16px/1.6 'Jost', system-ui, sans-serif;
}
.sheet p {
  margin: 0 0 14px;
  white-space: pre-line;
}
.sheet__head {
  display: grid;
  gap: 2px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  background: linear-gradient(#0000 calc(100% - 2px), #e4e1d8 0);
  font-size: 14px;
  color: #555;
}
.sheet__head span:first-child {
  color: #111;
  font-weight: 500;
}
.sheet__foot {
  margin-top: 28px;
  font-size: 13px;
  color: #777;
}
.sheet--post {
  border-radius: 14px;
}
.xf-enter-active,
.xf-leave-active {
  transition: opacity 0.2s ease;
}
.xf-enter-from,
.xf-leave-to {
  opacity: 0;
}

/* board */
.board {
  padding-block: 120px;
}
.board__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: minmax(200px, 22vw);
  gap: 6px;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px;
  overflow: hidden;
}
.tile--head {
  grid-column: span 2;
  justify-content: flex-start;
  padding-left: 0;
}
.tile--head h2 {
  margin: 0;
  font: 700 clamp(40px, 5vw, 84px) / 0.92 var(--f-display);
  letter-spacing: -0.03em;
  text-transform: uppercase;
}
.tile--big {
  grid-column: span 2;
  grid-row: span 2;
}
.tile--ink {
  background: #000;
  color: #fff;
}
.tile--pink {
  background: var(--pink);
}
.tile--blue {
  background: var(--blue);
  color: #fff;
}
.tile--white {
  background: #fff;
}
.cap {
  margin: 0;
  font-size: 15px;
}
.cap b {
  display: block;
  font-size: 18px;
  font-weight: 500;
}
.z {
  font-family: 'Jost', system-ui, sans-serif;
}
.z-model {
  display: grid;
  gap: 0.15em;
  font-size: clamp(36px, 4.4vw, 72px);
  font-weight: 500;
  letter-spacing: -0.02em;
}
.z-model__row {
  padding: 0.12em 0.3em;
  color: #777;
}
.z-model__row.on {
  background: #fff;
  color: #000;
}
.z-pay {
  display: flex;
  gap: 8px;
}
.z-pay b {
  padding: 0.2em 0.35em;
  background: #000;
  color: var(--pink);
  font-size: clamp(28px, 3vw, 48px);
}
.z-toggle {
  position: relative;
  width: 2.2em;
  height: 1.15em;
  font-size: clamp(48px, 5vw, 80px);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.2);
  transition: background-color 0.2s;
}
.z-toggle span {
  position: absolute;
  top: 0.1em;
  left: 0.1em;
  width: 0.95em;
  height: 0.95em;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.z-toggle[aria-checked='true'] {
  background: var(--green);
}
.z-toggle[aria-checked='true'] span {
  transform: translateX(1.05em);
}
.z-toggle:focus-visible {
  outline: 4px solid #fff;
  outline-offset: 4px;
}
.z-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-size: clamp(22px, 2.2vw, 34px);
  font-weight: 500;
}
.z-status i {
  width: 0.6em;
  height: 0.6em;
  border-radius: 50%;
  background: var(--green);
}
.z-code {
  margin: 0;
  font: 500 clamp(18px, 2vw, 30px) / 1.45 ui-monospace, Menlo, monospace;
  color: #fff;
  white-space: pre;
}

/* bar */
.bar {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-block: 120px;
}
.bar__h {
  margin: 0 0 64px;
  max-width: 12em;
  font: 700 clamp(48px, 6.4vw, 104px) / 0.92 var(--f-display);
  letter-spacing: -0.03em;
  text-transform: uppercase;
}
.bar__row {
  display: flex;
  gap: 6px;
}
.bar__seg {
  flex-basis: 0;
  height: 22vh;
  min-height: 140px;
  padding: 20px;
}
.bar__dur {
  font: 500 clamp(18px, 2vw, 30px) / 1.1 var(--f-display);
}
.bar__row--clauses p {
  flex-basis: 0;
  margin: 14px 0 0;
  max-width: 22ch;
  font-size: 17px;
}

/* say */
.say {
  display: grid;
  grid-template-columns: 5fr 7fr;
  min-height: 70svh;
}
.say__who {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 32px;
  background: #000;
  color: #fff;
}
.say__who b {
  font-size: 20px;
  font-weight: 500;
}
.say__who span {
  font-size: 16px;
  color: #a3a3a3;
}
.say__q {
  margin: 0;
  padding: 48px;
  max-width: none;
  background: var(--blue);
  color: #fff;
  font: 500 clamp(28px, 3vw, 44px) / 1.15 var(--f-display);
  text-indent: -0.4em;
}

/* footer */
.foot {
  padding-block: 80px 32px;
  min-height: 0;
}
.mark {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 34svh;
  min-height: 220px;
}
.mark__b {
  flex: 1;
  display: flex;
  align-items: flex-end;
  padding: 0 0 0.04em 0.08em;
  font: 700 clamp(80px, 16vw, 260px) / 0.8 var(--f-display);
  color: #000;
  overflow: hidden;
}
.mark__b--0 {
  height: 70%;
  background: var(--pink);
}
.mark__b--1 {
  height: 88%;
  background: var(--yellow);
}
.mark__b--2 {
  height: 100%;
  background: var(--blue);
  color: #fff;
}
.mark__b--3 {
  height: 62%;
  background: var(--green);
}
.foot__cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr) 2fr;
  gap: 24px;
  margin-top: 56px;
  font-size: 15px;
}
.foot__cols nav,
.foot__contact {
  display: grid;
  align-content: start;
  gap: 6px;
  color: #a3a3a3;
}
.foot__cols b {
  color: #fff;
  font-weight: 500;
}
.foot__cols a {
  color: #fff;
  transition: color 0.18s;
}
.foot__cols a:hover {
  color: var(--yellow);
}
.foot__last {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 48px;
  font-size: 14px;
  color: #a3a3a3;
}
.foot__btn {
  padding: 10px 16px;
  background: var(--green);
  color: #000;
  font-weight: 500;
  transition: transform 0.14s;
}
.foot__btn:hover {
  transform: translateY(-2px);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(0.3em);
  }
}

@media (max-width: 860px) {
  .hero__h {
    top: 16%;
    font-size: 21vw;
  }
  .hero__sub {
    left: var(--margin);
    right: auto;
    width: 80%;
    bottom: 24px;
    text-align: left;
    font-size: 16px;
  }
  .outs {
    grid-template-columns: 1fr;
    padding-top: 72px;
  }
  .outs__names {
    display: flex;
    gap: 20px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    margin-bottom: 20px;
  }
  .outs__name {
    flex: none;
    scroll-snap-align: start;
    font-size: 22px;
  }
  .outs__stage {
    grid-column: 1;
    height: 70svh;
    padding: 16px 0 0 16px;
    margin-inline: calc(var(--margin) * -1);
  }
  .board__grid {
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 28vw;
  }
  .tile--head {
    grid-row: span 2;
  }
  .tile--head h2 {
    font-size: 9vw;
  }
  .tile:not(.tile--big):not(.tile--head) {
    grid-row: span 2;
    grid-column: span 1;
  }
  .tile--big {
    grid-row: span 3;
  }
  .tile {
    padding: 14px;
  }
  .cap {
    font-size: 14px;
  }
  .cap b {
    font-size: 16px;
  }
  .bar__h {
    font-size: 11vw;
  }
  .bar__row {
    flex-direction: column;
  }
  .bar__seg {
    height: auto;
    min-height: 72px;
  }
  .bar__row--clauses {
    display: none;
  }
  .bar__seg::after {
    content: attr(data-clause);
  }
  .say {
    grid-template-columns: 1fr;
  }
  .say__q {
    order: -1;
    padding: 24px 24px 72px 32px;
    font-size: 26px;
  }
  .say__who {
    min-height: 96px;
    padding: 24px;
  }
  .foot__cols {
    grid-template-columns: 1fr 1fr;
  }
  .foot__contact {
    grid-column: 1 / -1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero__h span,
  .hero__sub {
    animation: none;
  }
}
</style>
