<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { answerFor, askExamples, reviews } from '@/content/landing'
import { getPlans } from '@/content/plans'
import { useGoogleFont } from '@/lib/fonts'
import { formatPrice } from '@/lib/format'
import { vReveal } from '@/lib/reveal'
import LiveFeatures from '../shared/LiveFeatures.vue'
import QuietFooter from '../shared/QuietFooter.vue'
import SentenceCta from '../shared/SentenceCta.vue'
import TileFaq from '../shared/TileFaq.vue'
import { useTyping } from '../shared/useTyping'

/**
 * Variant 3 — "The product performs".
 * Idea: the first screen is not a picture of the chat, it IS the chat — type and get an answer.
 */
useGoogleFont('family=Golos+Text:wght@400;500;600')

const router = useRouter()
const week = getPlans('text')[0]!

// ---------- hero: live chat on the stage ----------
type Msg = { role: 'user' | 'assistant'; text: string }
const history = ref<Msg[]>([{ role: 'user', text: askExamples[1]!.q }, { role: 'assistant', text: askExamples[1]!.a }])
const draft = ref('')
const asked = ref(0)
const { text: streaming, busy, type } = useTyping(24)
const feed = ref<HTMLElement | null>(null)

const shown = computed<Msg[]>(() => (busy.value ? [...history.value, { role: 'assistant', text: streaming.value }] : history.value))

async function ask(q?: string) {
  const text = (q ?? draft.value).trim()
  if (!text || busy.value) return
  if (asked.value >= 3) return router.push({ name: 'chat', query: { q: text } })
  asked.value++
  draft.value = ''
  history.value.push({ role: 'user', text })
  await nextTick()
  feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: 'smooth' })
  await type(answerFor(text))
  history.value.push({ role: 'assistant', text: streaming.value })
  await nextTick()
  feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: 'smooth' })
}

// ---------- showcase: one control, blown up ----------
const pro = ref(false)

const comment = reviews[3]!
const replies = [reviews[4]!, reviews[5]!]
</script>

<template>
  <div class="v3">
    <header class="nav">
      <RouterLink to="/" class="nav__mark">ruAI</RouterLink>
      <nav class="nav__links" aria-label="Разделы">
        <a href="#how">Как устроено</a>
        <a href="#price">Цена</a>
        <a href="#faq">Вопросы</a>
        <RouterLink to="/chat">Чат</RouterLink>
      </nav>
    </header>

    <!-- HERO: fragment on a shaped stage -->
    <section class="hero" aria-labelledby="h1">
      <div class="hero__text">
        <h1 id="h1" class="hero__h" v-reveal>Отвечает на русском<br />без VPN</h1>
        <p class="hero__sub" v-reveal="80">ruAI — нейросеть для текстов, учёбы и кода. Спросите прямо здесь: это настоящий чат.</p>
        <RouterLink to="/chat" class="btn" v-reveal="140">Открыть полный чат</RouterLink>
      </div>
      <div class="hero__stage">
        <div class="hero__ui" data-ui>
          <div class="ui__top"><b>ruAI Lite</b><span>{{ 3 - asked }} {{ 3 - asked === 1 ? 'вопрос' : 'вопроса' }} на этой странице</span></div>
          <div ref="feed" class="ui__feed" aria-live="polite">
            <p v-for="(m, i) in shown" :key="i" class="ui__msg" :class="`ui__msg--${m.role}`">{{ m.text }}</p>
          </div>
          <div class="ui__chips">
            <button v-for="e in [askExamples[0]!, askExamples[2]!, askExamples[3]!]" :key="e.q" class="ui__chip" :disabled="busy" @click="ask(e.q)">{{ e.q }}</button>
          </div>
          <form class="ui__form" @submit.prevent="ask()">
            <label class="sr-only" for="hero-q">Ваш вопрос</label>
            <input id="hero-q" v-model="draft" placeholder="Спросите ruAI" autocomplete="off" enterkeyhint="send" />
            <button type="submit" :disabled="busy || !draft.trim()" aria-label="Отправить">↑</button>
          </form>
        </div>
      </div>
    </section>

    <main class="wrap">
      <!-- SHOWCASE: one control, blown up -->
      <section id="how" class="blow" :class="{ 'blow--pro': pro }" aria-labelledby="blow-h">
        <div class="blow__text">
          <h2 id="blow-h" class="blow__h">{{ pro ? 'Глубокий' : 'Быстрый' }} ответ</h2>
          <p>Одна кнопка решает, сколько ruAI думает: Lite отвечает за секунду, Pro разбирает задачу по шагам.</p>
        </div>
        <div class="blow__ctl" data-ui role="radiogroup" aria-label="Модель">
          <button role="radio" :aria-checked="!pro" :class="{ on: !pro }" @click="pro = false">Lite</button>
          <button role="radio" :aria-checked="pro" :class="{ on: pro }" @click="pro = true">Pro</button>
        </div>
      </section>

      <LiveFeatures />

      <!-- TESTIMONIAL: quote as comment thread -->
      <section class="thread" aria-labelledby="thread-h">
        <h2 id="thread-h" class="sr-only">Отзывы</h2>
        <article class="cm cm--big" data-ui v-reveal>
          <header><span class="cm__ava">{{ comment.name[0] }}</span><b>{{ comment.name }}</b><span>{{ comment.role }}, {{ comment.city }}</span><time>12 октября</time></header>
          <p>{{ comment.text }}</p>
          <footer>Отмечено как полезное · 214</footer>
        </article>
        <div class="thread__replies">
          <article v-for="(r, i) in replies" :key="r.name" class="cm" data-ui v-reveal="100 * (i + 1)">
            <header><span class="cm__ava">{{ r.name[0] }}</span><b>{{ r.name }}</b><span>{{ r.role }}</span><time>{{ ['14 октября', '2 ноября'][i] }}</time></header>
            <p>{{ r.text }}</p>
          </article>
        </div>
      </section>

      <!-- PRICING: the price, very large -->
      <section id="price" class="big" aria-labelledby="big-h">
        <div class="big__text">
          <h2 id="big-h" class="big__h">Неделя доступа</h2>
          <p>Хватает, чтобы понять, нужен ли вам ruAI каждый день. Продлевается автоматически, отменить можно в профиле.</p>
        </div>
        <div class="big__fig">
          <p class="big__num" v-reveal><span class="big__cur">₽</span>{{ week.price }}<span class="big__per">в неделю</span></p>
          <div class="big__chip" data-ui><b>МИР</b><b>СБП</b><b>SberPay</b></div>
          <ul class="big__inc">
            <li>Модели Lite и Pro</li>
            <li>Длинные диалоги и история</li>
            <li>Оплата картами банков РФ</li>
            <li>Месяц — {{ formatPrice(getPlans('text')[1]!.price) }} ₽, три месяца — {{ formatPrice(getPlans('text')[2]!.price) }} ₽</li>
          </ul>
          <RouterLink :to="{ name: 'checkout', params: { plan: 'week' }, query: { tier: 'text' } }" class="btn">Оформить за {{ week.price }} ₽</RouterLink>
        </div>
      </section>

      <div id="faq"><TileFaq title="Вопросы" /></div>

      <SentenceCta before="Спросите про" after="— ruAI ответит" verb="сейчас" placeholder="налоги" />

      <QuietFooter />
    </main>
  </div>
</template>

<style scoped>
.v3 {
  --bg: #f1efea;
  --surface: #e4e1da;
  --ink: #121212;
  --muted: #5b5852;
  --accent: #121212;
  --accent-ink: #f1efea;
  --stage: #a08672;
  --f-display: 'Golos Text', 'Onest', system-ui, sans-serif;
  --f-text: 'Golos Text', 'Onest', system-ui, sans-serif;
  --margin: clamp(16px, 2.8vw, 40px);
  --radius: 0;
  --h-weight: 500;
  --ui-font: 'Golos Text', system-ui, sans-serif;
  --lf-stage: var(--stage);
  background: var(--bg);
  color: var(--ink);
  font: 400 17px/1.5 var(--f-text);
  overflow-x: clip;
}
.v3 ::selection {
  background: var(--stage);
  color: #fff;
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
  min-height: 48px;
  padding: 0 22px;
  background: var(--ink);
  color: var(--bg);
  font: 600 16px var(--f-text);
  transition: transform 0.14s ease, background-color 0.18s;
}
.btn:hover {
  background: #3a2f27;
}
.btn:active {
  transform: translateY(1px);
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px var(--margin) 0;
  font-size: 15px;
}
.nav__mark {
  font-weight: 600;
  font-size: 20px;
  letter-spacing: -0.02em;
}
.nav__links {
  display: flex;
  gap: 28px;
}
.nav__links a {
  transition: color 0.18s;
}
.nav__links a:hover {
  color: var(--stage);
}

/* hero */
.hero {
  position: relative;
  height: 122svh;
  min-height: 900px;
  padding-top: clamp(64px, 10vh, 120px);
}
.hero__text {
  position: relative;
  z-index: 2;
  max-width: 64vw;
  padding-left: var(--margin);
}
.hero__h {
  margin: 0;
  font: 500 clamp(44px, 5.2vw, 80px) / 1 var(--f-display);
  letter-spacing: -0.035em;
}
.hero__sub {
  max-width: 40ch;
  margin: 24px 0 28px;
  font-size: 18px;
}
.hero__stage {
  position: absolute;
  top: max(52svh, 470px);
  left: 33.33%;
  right: 0;
  bottom: 0;
  background: var(--stage);
  clip-path: polygon(16.66% 0, 100% 0, 100% 100%, 0 100%, 0 64px, 16.66% 64px);
  animation: shutter 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.hero__ui {
  display: flex;
  flex-direction: column;
  width: min(620px, calc(100% - 56px));
  height: calc(100% - 56px);
  margin: 56px 0 0 56px;
  background: #fff;
  color: #121212;
  font: 400 15px/1.5 var(--ui-font);
}
.ui__top {
  display: flex;
  justify-content: space-between;
  padding: 16px 20px 8px;
  font-size: 14px;
}
.ui__top span {
  color: var(--muted);
}
.ui__feed {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ui__msg {
  margin: 0;
  max-width: 86%;
  white-space: pre-wrap;
}
.ui__msg--user {
  align-self: flex-end;
  padding: 8px 14px;
  border-radius: 16px 16px 4px 16px;
  background: #efece6;
}
.ui__chips {
  display: flex;
  gap: 6px;
  padding: 4px 20px 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.ui__chip {
  flex: none;
  padding: 6px 12px;
  border-radius: 999px;
  background: #efece6;
  font-size: 13px;
  transition: background-color 0.15s;
}
.ui__chip:hover:not(:disabled) {
  background: #e2ddd3;
}
.ui__form {
  display: flex;
  gap: 8px;
  margin: 0 14px 14px;
  padding: 6px 6px 6px 16px;
  border-radius: 999px;
  background: #efece6;
}
.ui__form input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  font-size: 16px;
}
.ui__form input:focus {
  outline: none;
}
.ui__form:focus-within {
  outline: 2px solid var(--stage);
}
.ui__form button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #121212;
  color: #fff;
  font-weight: 700;
}
.ui__form button:disabled {
  opacity: 0.35;
}

.wrap {
  padding-inline: var(--margin);
}

/* blown-up control */
.blow {
  position: relative;
  min-height: 92svh;
  margin-inline: calc(var(--margin) * -1);
  padding: 72px var(--margin);
  background: #1d1d1b;
  color: #f1efea;
  overflow: hidden;
  transition: background-color 0.35s ease;
}
.blow--pro {
  background: var(--stage);
  color: #121212;
}
.blow__h {
  margin: 0;
  font: 500 clamp(28px, 2.6vw, 40px) / 1.1 var(--f-display);
  letter-spacing: -0.02em;
}
.blow__text p {
  max-width: 40ch;
  margin: 12px 0 0;
}
.blow__ctl {
  position: absolute;
  right: -8vw;
  bottom: -6vh;
  display: flex;
  padding: 0.06em;
  font: 600 clamp(110px, 20vw, 300px) / 1 var(--f-display);
  letter-spacing: -0.04em;
  background: rgb(255 255 255 / 0.12);
  border-radius: 0.3em;
}
.blow--pro .blow__ctl {
  background: rgb(0 0 0 / 0.12);
}
.blow__ctl button {
  padding: 0.05em 0.3em 0.12em;
  border-radius: 0.25em;
  color: inherit;
  opacity: 0.55;
  transition: background-color 0.3s, color 0.3s, opacity 0.3s;
}
.blow__ctl button.on {
  opacity: 1;
  background: #f1efea;
  color: #121212;
}
.blow--pro .blow__ctl button.on {
  background: #121212;
  color: var(--stage);
}
.blow__ctl button:focus-visible {
  outline: 6px solid currentColor;
}

.wrap :deep(.lf) {
  margin-top: 0;
}

/* thread */
.thread {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  padding-block: clamp(120px, 14vw, 200px);
}
.cm {
  font: 400 15px/1.5 var(--ui-font);
}
.cm header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 10px;
  font-size: 14px;
}
.cm header span:not(.cm__ava),
.cm time,
.cm footer {
  color: var(--muted);
}
.cm__ava {
  display: grid;
  place-items: center;
  width: 2.4em;
  height: 2.4em;
  border-radius: 50%;
  background: var(--stage);
  color: #fff;
  font-weight: 600;
}
.cm p {
  margin: 10px 0 0;
}
.cm footer {
  margin-top: 14px;
  font-size: 14px;
}
.cm--big {
  grid-column: 2 / 10;
  font-size: clamp(28px, 3vw, 46px);
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.cm--big header,
.cm--big footer {
  font-size: 0.5em;
  letter-spacing: 0;
}
.cm--big .cm__ava {
  font-size: 1em;
}
.thread__replies {
  grid-column: 2 / 10;
  display: grid;
  gap: 32px;
  margin-top: 48px;
  padding-left: 3.2em;
}
.thread__replies .cm {
  max-width: 440px;
}

/* big price */
.big {
  display: grid;
  grid-template-columns: 4fr 1fr 7fr;
  align-items: center;
  min-height: 80svh;
  padding-block: 80px;
}
.big__h {
  margin: 0;
  font: 500 clamp(28px, 2.6vw, 36px) / 1.1 var(--f-display);
}
.big__text p {
  margin: 12px 0 0;
}
.big__fig {
  grid-column: 3;
  position: relative;
}
.big__num {
  display: flex;
  align-items: baseline;
  margin: 0;
  font: 500 clamp(120px, 16vw, 240px) / 0.85 var(--f-display);
  letter-spacing: -0.06em;
}
.big__cur {
  align-self: flex-start;
  font-size: 0.5em;
  margin-right: 0.08em;
}
.big__per {
  margin-left: 12px;
  font-size: 18px;
  letter-spacing: 0;
}
.big__chip {
  position: absolute;
  top: -0.6em;
  right: 0;
  display: flex;
  gap: 6px;
  padding: 10px;
  background: var(--stage);
  font: 600 15px var(--ui-font);
  color: #fff;
}
.big__chip b {
  padding: 6px 10px;
  background: rgb(0 0 0 / 0.18);
}
.big__inc {
  display: grid;
  gap: 4px;
  margin: 28px 0 24px;
  padding: 0;
  list-style: none;
  font-size: 18px;
}

@keyframes shutter {
  from {
    clip-path: polygon(16.66% 100%, 100% 100%, 100% 100%, 0 100%, 0 100%, 16.66% 100%);
  }
}

@media (max-width: 860px) {
  .nav__links a:not(:last-child) {
    display: none;
  }
  .hero {
    height: auto;
    min-height: 0;
    padding-top: 48px;
  }
  .hero__text {
    max-width: none;
  }
  .hero__h {
    font-size: 10vw;
  }
  .hero__sub {
    font-size: 16px;
  }
  .hero__stage {
    position: relative;
    top: auto;
    left: auto;
    height: 74svh;
    min-height: 520px;
    margin-top: 40px;
    clip-path: polygon(72px 0, 100% 0, 100% 100%, 0 100%, 0 40px, 72px 40px);
  }
  .hero__ui {
    width: calc(100% - 32px);
    height: calc(100% - 56px);
    margin: 56px 16px 0;
  }
  .blow {
    min-height: 86svh;
  }
  .blow__h {
    font-size: 26px;
  }
  .blow__ctl {
    left: 16px;
    right: auto;
    bottom: 6vh;
    font-size: 30vw;
  }
  .thread {
    display: block;
  }
  .cm--big {
    font-size: 7vw;
  }
  .thread__replies {
    padding-left: 28px;
  }
  .big {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .big__fig {
    grid-column: 1;
  }
  .big__num {
    font-size: 34vw;
  }
  .big__chip {
    top: -1.4em;
  }
  .big__fig .btn {
    width: 100%;
    justify-content: center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero__stage {
    animation: none;
  }
}
</style>
