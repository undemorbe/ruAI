<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { askExamples, reviews } from '@/content/landing'
import { getPlans } from '@/content/plans'
import { useGoogleFont } from '@/lib/fonts'
import { vReveal } from '@/lib/reveal'
import QuietFooter from '../shared/QuietFooter.vue'
import SentenceCta from '../shared/SentenceCta.vue'
import StepPlans from '../shared/StepPlans.vue'
import TileFaq from '../shared/TileFaq.vue'
import type { WordsScene } from './WordsScene'

/**
 * Variant 6 — "Answers are made of words".
 * Idea: ruAI's output is Russian text, so the hero is text as matter — 14 000 particles that
 * assemble into what ruAI writes. The visitor can scatter them with the pointer or type their own word.
 */
useGoogleFont('family=Dela+Gothic+One&family=Commissioner:wght@400;500;600')
const DISPLAY = '"Dela Gothic One", "Arial Black", sans-serif'

const router = useRouter()
const week = getPlans('text')[0]!

const WORDS = [
  { w: 'ruAI', cap: 'Нейросеть, которая отвечает по-русски' },
  { w: 'письмо', cap: 'Напишет письмо, которое не стыдно отправить' },
  { w: 'урок', cap: 'Объяснит тему так, чтобы стало понятно' },
  { w: 'маршрут', cap: 'Спланирует выходные по часам' },
  { w: 'код', cap: 'Найдёт ошибку и предложит исправление' },
  { w: 'без VPN', cap: 'Работает в России напрямую' },
]
const ROWS = [
  { w: 'Письмо', ex: askExamples[0]! },
  { w: 'Урок', ex: askExamples[1]! },
  { w: 'Маршрут', ex: askExamples[2]! },
  { w: 'Код', ex: askExamples[3]! },
]

const canvas = ref<HTMLCanvasElement | null>(null)
const heroEl = ref<HTMLElement | null>(null)
const scene = shallowRef<WordsScene | null>(null)
const webgl = ref(true)
const idx = ref(0)
const caption = ref(WORDS[0]!.cap)
const shown = ref(WORDS[0]!.w)
const own = ref('')
let ownMode = false
let timer: ReturnType<typeof setInterval> | undefined
let io: IntersectionObserver | null = null
let visible = true

function show(word: string, cap: string) {
  shown.value = word
  caption.value = cap
  scene.value?.setWord(word)
}
function next() {
  if (ownMode) return
  idx.value = (idx.value + 1) % WORDS.length
  show(WORDS[idx.value]!.w, WORDS[idx.value]!.cap)
}
function startCycle() {
  if (!timer && !ownMode) timer = setInterval(next, 3600)
}
function stopCycle() {
  clearInterval(timer)
  timer = undefined
}

function submitOwn() {
  const w = own.value.trim()
  if (!w) return
  ownMode = true
  stopCycle()
  show(w.slice(0, 14), `Спросить ruAI про «${w}»`)
}
function askOwn() {
  const w = own.value.trim() || shown.value
  router.push({ name: 'chat', query: { q: `Расскажи про «${w}»` } })
}

function onPointer(e: PointerEvent) {
  const el = heroEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  if (e.clientY > r.bottom) return
  scene.value?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
}
function onVisibility() {
  if (document.hidden) scene.value?.stop()
  else if (visible) scene.value?.start()
}

onMounted(async () => {
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const small = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4
  try {
    // glyphs must be loaded before they are sampled into particles
    await Promise.race([document.fonts.load(`400 100px ${DISPLAY}`, 'ruAIпиьмоурккдмшВPN'), new Promise((r) => setTimeout(r, 2500))])
    const { WordsScene } = await import('./WordsScene')
    if (!canvas.value) return
    scene.value = new WordsScene(canvas.value, {
      quality: small ? 'low' : 'high',
      reducedMotion: reduced,
      font: DISPLAY,
      ink: '#f6e9d6',
      hot: '#ff6a3d',
    })
    scene.value.setWord(WORDS[0]!.w)
    scene.value.start()
    startCycle()
    io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      if (visible && !document.hidden) {
        scene.value?.start()
        startCycle()
      } else {
        scene.value?.stop()
        stopCycle()
      }
    })
    if (heroEl.value) io.observe(heroEl.value)
  } catch {
    webgl.value = false
    startCycle()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointer)
  document.removeEventListener('visibilitychange', onVisibility)
  io?.disconnect()
  stopCycle()
  scene.value?.dispose()
})
</script>

<template>
  <div class="v6">
    <header class="nav">
      <RouterLink to="/" class="nav__mark">ruAI</RouterLink>
      <nav class="nav__links" aria-label="Разделы">
        <a href="#words">Что умеет</a>
        <a href="#price">Цены</a>
        <a href="#faq">Вопросы</a>
      </nav>
      <RouterLink to="/chat" class="nav__cta">Открыть чат</RouterLink>
    </header>

    <section ref="heroEl" class="hero" aria-labelledby="h1" @pointerleave="scene?.clearPointer()">
      <canvas v-show="webgl" ref="canvas" class="hero__canvas" aria-hidden="true" />
      <p v-if="!webgl" class="hero__still" aria-hidden="true">{{ shown }}</p>
      <p class="hero__cap" aria-live="polite">{{ caption }}</p>

      <div class="hero__foot">
        <div class="hero__copy">
          <h1 id="h1" class="hero__h">Нейросеть, которая пишет по-русски</h1>
          <p class="hero__sub">Работает в России без VPN. Неделя — {{ week.price }} ₽, оплата картой МИР или через СБП.</p>
          <RouterLink to="/chat" class="btn-hot">Открыть чат</RouterLink>
        </div>
        <form class="own" @submit.prevent="submitOwn">
          <label for="own-in" class="own__label">Соберите своё слово</label>
          <div class="own__row">
            <input id="own-in" v-model="own" class="own__in" maxlength="14" autocomplete="off" placeholder="например, борщ" />
            <button class="own__go" type="submit">Собрать</button>
          </div>
          <button v-if="own.trim()" type="button" class="own__ask" @click="askOwn">Спросить ruAI про «{{ own.trim() }}» →</button>
        </form>
      </div>
    </section>

    <section id="words" class="words" aria-labelledby="words-h">
      <h2 id="words-h" class="h2" v-reveal>Четыре слова — четыре дела</h2>
      <article v-for="(r, i) in ROWS" :key="r.w" class="row" v-reveal="i * 60">
        <h3 class="row__w">{{ r.w }}</h3>
        <div class="row__body">
          <p class="row__q">{{ r.ex.q }}</p>
          <p class="row__a">{{ r.ex.a }}</p>
          <RouterLink :to="{ name: 'chat', query: { q: r.ex.q } }" class="row__link">Спросить так же →</RouterLink>
        </div>
      </article>
    </section>

    <section class="said" aria-labelledby="said-h">
      <h2 id="said-h" class="h2" v-reveal>Что говорят словами</h2>
      <div class="said__grid">
        <blockquote v-for="(r, i) in reviews.slice(0, 3)" :key="r.name" class="said__q" :class="`said__q--${i}`" v-reveal="i * 90">
          <p>«{{ r.text }}»</p>
          <footer>{{ r.name }} · {{ r.role }}, {{ r.city }}</footer>
        </blockquote>
      </div>
    </section>

    <div id="price" class="wrap"><StepPlans title="Сколько стоит" /></div>
    <div id="faq" class="wrap"><TileFaq /></div>
    <div class="wrap"><SentenceCta /></div>
    <div class="wrap"><QuietFooter /></div>
  </div>
</template>

<style scoped>
.v6 {
  --bg: #22080c;
  --surface: #33121a;
  --ink: #f6e9d6;
  --muted: #c9b5a4;
  --accent: #ff6a3d;
  --accent-ink: #22080c;
  --accent-hover: #ff8a63;
  --f-display: 'Dela Gothic One', 'Arial Black', sans-serif;
  --f-text: 'Commissioner', 'Golos Text', system-ui, sans-serif;
  --margin: clamp(16px, 3vw, 44px);
  --radius: 6px;
  --h-weight: 400;
  --h-case: none;
  --sc-weight: 400;
  --plan-1: #f6e9d6;
  --plan-1-ink: #22080c;
  --plan-2: #ff6a3d;
  --plan-2-ink: #22080c;
  --plan-3: #4a1a24;
  --plan-3-ink: #f6e9d6;
  --ui-bg: #f6e9d6;
  --ui-ink: #22080c;
  --ui-soft: #7a5a52;
  --ui-bubble: #ead8c1;
  --ui-accent: #ff6a3d;
  --ui-accent-ink: #22080c;
  --ui-font: 'Commissioner', system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
  font: 400 clamp(1rem, 0.96rem + 0.2vw, 1.125rem) / 1.55 var(--f-text);
  overflow-x: clip;
}
.v6 ::selection {
  background: var(--accent);
  color: var(--accent-ink);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.wrap {
  padding-inline: var(--margin);
}
.h2 {
  margin: 0 0 clamp(32px, 4vw, 56px);
  font: 400 clamp(2rem, 1.3rem + 3vw, 4rem) / 1.02 var(--f-display);
  letter-spacing: -0.01em;
}

/* nav */
.nav {
  position: absolute;
  inset: 0 0 auto;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 32px;
  padding: calc(18px + env(safe-area-inset-top, 0px)) var(--margin) 18px;
}
.nav__mark {
  font: 400 24px/1 var(--f-display);
}
.nav__links {
  display: flex;
  gap: 24px;
  margin-left: auto;
  color: var(--muted);
}
.nav__links a:hover {
  color: var(--ink);
}
.nav__cta {
  padding: 10px 16px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--bg);
  font-weight: 500;
  transition: background-color 0.2s;
}
.nav__cta:hover {
  background: var(--accent);
}

/* hero */
.hero {
  position: relative;
  height: 100svh;
  min-height: 640px;
  overflow: hidden;
  touch-action: pan-y;
}
.hero__canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.hero__still {
  position: absolute;
  inset: 22% 0 auto;
  margin: 0;
  text-align: center;
  font: 400 clamp(64px, 14vw, 220px) / 1 var(--f-display);
}
.hero__cap {
  position: absolute;
  top: 61%;
  left: 0;
  right: 0;
  margin: 0;
  text-align: center;
  color: var(--muted);
  font-size: clamp(1rem, 0.9rem + 0.4vw, 1.25rem);
  pointer-events: none;
}
.hero__foot {
  position: absolute;
  inset: auto var(--margin) calc(32px + env(safe-area-inset-bottom, 0px));
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
}
.hero__copy {
  max-width: 34rem;
}
.hero__h {
  margin: 0;
  font: 400 clamp(1.75rem, 1.2rem + 2.2vw, 3.25rem) / 1.04 var(--f-display);
  letter-spacing: -0.01em;
}
.hero__sub {
  max-width: 30rem;
  margin: 16px 0 24px;
  color: var(--muted);
}
.btn-hot {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 22px;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
  transition: background-color 0.2s, transform 0.2s;
}
.btn-hot:hover {
  background: var(--accent-hover);
}
.btn-hot:active {
  transform: scale(0.98);
}
.own {
  width: min(22rem, 100%);
}
.own__label {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 0.9375rem;
}
.own__row {
  display: flex;
  gap: 8px;
}
.own__in {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  font: 500 16px var(--f-text);
}
.own__in::placeholder {
  color: #8f7569;
}
.own__in:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.own__go {
  min-height: 48px;
  padding: 0 16px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--bg);
  font-weight: 600;
  transition: background-color 0.2s;
}
.own__go:hover {
  background: var(--accent);
}
.own__ask {
  margin-top: 10px;
  color: var(--accent);
  font-weight: 500;
  text-align: left;
}
.own__ask:hover {
  text-decoration: underline;
}

/* words */
.words {
  padding: clamp(96px, 12vw, 180px) var(--margin) clamp(64px, 8vw, 120px);
}
.row {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 24px 48px;
  padding: clamp(28px, 3.5vw, 48px) 0;
}
.row + .row {
  border-top: 1px solid #4a1f28;
}
.row__w {
  margin: 0;
  font: 400 clamp(3rem, 1.6rem + 6vw, 7.5rem) / 0.9 var(--f-display);
  letter-spacing: -0.02em;
  transition: color 0.3s;
}
.row:hover .row__w {
  color: var(--accent);
}
.row__q {
  width: fit-content;
  max-width: 100%;
  margin: 0 0 14px;
  padding: 10px 16px;
  border-radius: 16px 16px 4px 16px;
  background: var(--surface);
  font-weight: 500;
}
.row__a {
  max-width: 40rem;
  margin: 0 0 16px;
  font-size: clamp(1.0625rem, 1rem + 0.3vw, 1.25rem);
}
.row__link {
  color: var(--accent);
  font-weight: 500;
}
.row__link:hover {
  text-decoration: underline;
}

/* reviews */
.said {
  padding: clamp(64px, 8vw, 120px) var(--margin);
  background: var(--ink);
  color: var(--bg);
}
.said__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
  align-items: start;
}
.said__q {
  margin: 0;
}
.said__q--1 {
  margin-top: 80px;
}
.said__q--2 {
  margin-top: 160px;
}
.said__q p {
  margin: 0 0 16px;
  font: 400 clamp(1.25rem, 1rem + 0.9vw, 1.75rem) / 1.25 var(--f-display);
}
.said__q footer {
  color: #6b4a45;
  font-size: 0.9375rem;
}

@media (max-width: 860px) {
  .nav__links {
    display: none;
  }
  .nav__cta {
    margin-left: auto;
  }
  .hero {
    min-height: 600px;
  }
  .hero__cap {
    top: 52%;
    padding-inline: var(--margin);
  }
  .hero__foot {
    flex-direction: column;
    align-items: stretch;
    gap: 24px;
  }
  .own {
    width: 100%;
  }
  .row {
    grid-template-columns: 1fr;
  }
  .said__grid {
    grid-template-columns: 1fr;
  }
  .said__q--1,
  .said__q--2 {
    margin-top: 0;
  }
}
</style>
