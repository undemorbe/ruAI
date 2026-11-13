<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { askExamples, answerFor, faq, reviews, stages, switches } from '@/content/landing'
import { getPlans } from '@/content/plans'
import { useGoogleFont } from '@/lib/fonts'
import { formatPrice } from '@/lib/format'
import { vReveal } from '@/lib/reveal'
import ChatFragment from '../../shared/ChatFragment.vue'
import SentenceCta from '../../shared/SentenceCta.vue'
import { useTyping } from '../../shared/useTyping'
import type { NebulaScene } from './NebulaScene'

/**
 * Variant 1 — "The sentence is the layout".
 * Idea: the word "ruAI" in the sentence «Спросите ruAI по-русски» is replaced by the assistant itself —
 * a live WebGL orb in a frame. Scrolling opens the frame to the whole screen (pinned story).
 */
useGoogleFont('family=Piazzolla:opsz,wght@8..30,400;8..30,500;8..30,600&display=swap')

const week = getPlans()[0]!
const plans = getPlans()

// ---------- hero: 3D orb + pinned frame ----------
const canvas = ref<HTMLCanvasElement | null>(null)
const heroEl = ref<HTMLElement | null>(null)
const progress = ref(0)
const navMode = ref<'hero' | 'dark' | 'paper'>('hero')
const webgl = ref(true)
const scene = shallowRef<NebulaScene | null>(null)
let heroIo: IntersectionObserver | null = null
let visible = true

const clip = computed(() => {
  // A soft round window (no hard rectangle): radius grows from around the orb to beyond the screen corners.
  const p = progress.value
  const vw = window.innerWidth
  const vh = window.innerHeight
  const e = 1 - Math.pow(1 - p, 3)
  const r0 = Math.min(vw, vh) * 0.3
  const r1 = Math.hypot(vw, vh) * 0.62
  const r = r0 + (r1 - r0) * e
  return `radial-gradient(circle ${r}px at 50% 50%, #000 ${r * 0.55}px, transparent ${r}px)`
})

/** The dark backdrop behind the orb: invisible at first (orb sits on the page colour), fades in with the scroll. */
const night = computed(() => Math.min(Math.max((progress.value - 0.06) / 0.5, 0), 1))
watch(night, (n) => scene.value?.setNight(n))

function onScroll() {
  const el = heroEl.value
  if (!el) return
  const travel = el.offsetHeight - window.innerHeight
  const p = Math.min(Math.max(-el.getBoundingClientRect().top / Math.max(travel * 0.7, 1), 0), 1)
  progress.value = p
  const past = el.getBoundingClientRect().bottom < 64
  navMode.value = past ? 'paper' : p > 0.5 ? 'dark' : 'hero'
  scene.value?.setScroll(p)
}
function onPointer(e: PointerEvent) {
  scene.value?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
}
function onFrameDown(e: PointerEvent) {
  scene.value?.pulse((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
}
function onVisibility() {
  if (document.hidden) scene.value?.stop()
  else if (visible) scene.value?.start()
}

// ---------- showcase: headline you can type ----------
const ask = ref(askExamples[0]!.q)
const { text: answer, busy, type } = useTyping(26)
watch(busy, (b) => scene.value?.setEnergy(b ? 1 : 0))
let askTimer: ReturnType<typeof setTimeout> | undefined
watch(ask, (q) => {
  clearTimeout(askTimer)
  askTimer = setTimeout(() => type(answerFor(q)), 650)
})

// ---------- features: sentences with switches ----------
const on = ref<boolean[]>(switches.map((_, i) => i < 2))
const BAND = ['b-orange', 'b-ink', 'b-surface', 'b-orange', 'b-ink']

// ---------- how: drag through the stages ----------
const stage = ref(0)
let touched = false
function takeOver() {
  touched = true
  stopAuto()
}
const howEl = ref<HTMLElement | null>(null)
let howTimer: ReturnType<typeof setInterval> | undefined
let howIo: IntersectionObserver | null = null
function stopAuto() {
  clearInterval(howTimer)
  howTimer = undefined
}
const stageMsgs = computed(() => {
  const ex = askExamples[2]!
  return [
    [] as { role: 'user' | 'assistant'; text: string }[],
    [{ role: 'user' as const, text: ex.q }],
    [
      { role: 'user' as const, text: ex.q },
      { role: 'assistant' as const, text: ex.a.slice(0, 64) + '…' },
    ],
    [
      { role: 'user' as const, text: ex.q },
      { role: 'assistant' as const, text: ex.a },
      { role: 'user' as const, text: 'Добавь, где поесть недорого' },
    ],
  ][stage.value]!
})

const quote = reviews[0]!

onMounted(async () => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  onScroll()
  void type(answerFor(ask.value))

  // The stage slider plays itself once it is in view, until the visitor touches it.
  howIo = new IntersectionObserver(
    ([e]) => {
      if (e?.isIntersecting && !howTimer && !touched) {
        howTimer = setInterval(() => (stage.value = (stage.value + 1) % 4), 2200)
      } else if (!e?.isIntersecting) stopAuto()
    },
    { threshold: 0.5 },
  )
  if (howEl.value) howIo.observe(howEl.value)

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const small = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4
  try {
    const { NebulaScene } = await import('./NebulaScene')
    if (!canvas.value) return
    scene.value = new NebulaScene(canvas.value, {
      quality: small ? 'low' : 'high',
      reducedMotion: reduced,
      palette: { deep: '#06142f', hot: '#1f8fff', light: '#c9f1ff', rim: '#5fe0ff', dustA: '#38b6ff', dustB: '#ffffff' },
    })
    scene.value.setScroll(progress.value)
    scene.value.setNight(night.value)
    scene.value.start()
    heroIo = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      if (visible && !document.hidden) scene.value?.start()
      else scene.value?.stop()
    })
    if (heroEl.value) heroIo.observe(heroEl.value)
  } catch {
    webgl.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  window.removeEventListener('pointermove', onPointer)
  document.removeEventListener('visibilitychange', onVisibility)
  heroIo?.disconnect()
  howIo?.disconnect()
  stopAuto()
  clearTimeout(askTimer)
  scene.value?.dispose()
})
</script>

<template>
  <div class="v1">
    <header class="nav" :class="`nav--${navMode}`">
      <RouterLink to="/" class="nav__mark">ruAI</RouterLink>
      <nav class="nav__links" aria-label="Разделы">
        <a href="#try">Попробовать</a>
        <a href="#price">Цена</a>
        <a href="#faq">Вопросы</a>
      </nav>
      <RouterLink to="/chat" class="btn-ink nav__cta">Открыть чат</RouterLink>
    </header>

    <!-- HERO: pinned sentence, frame opens to the whole screen -->
    <section ref="heroEl" class="hero" aria-labelledby="h1">
      <div class="hero__stage">
        <div
          class="hero__frame"
          :style="{ maskImage: clip, WebkitMaskImage: clip }"
          aria-hidden="true"
          @pointerdown="onFrameDown"
          @pointerenter="scene?.setEnergy(0.7)"
          @pointerleave="scene?.setEnergy(0)"
        >
          <div class="hero__night" :style="{ opacity: night }" />
          <canvas v-show="webgl" ref="canvas" class="hero__canvas" />
          <div v-if="!webgl" class="hero__still" />
        </div>
        <h1 id="h1" class="hero__h" :style="{ '--p': progress }">
          <span class="hero__half hero__half--l"><span v-for="(ch, i) in [...'Спросите']" :key="i" class="ltr" :style="{ '--i': i }">{{ ch }}</span></span>
          <span class="sr-only">ruAI</span>
          <span class="hero__half hero__half--r"><span v-for="(ch, i) in [...'по-русски']" :key="i" class="ltr" :style="{ '--i': i + 6 }">{{ ch }}</span></span>
        </h1>
        <p class="hero__sub" :style="{ opacity: 1 - progress * 1.6 }">
          ruAI — нейросеть, которая работает в России без VPN. Неделя доступа {{ week.price }} ₽, оплата картой МИР или через СБП.
        </p>
        <p class="hero__held" :style="{ opacity: Math.max(0, progress * 2.2 - 1.2) }">
          Тексты, код, учёба и идеи — в одном окне.
          <RouterLink to="/chat" class="hero__held-link">Задать вопрос</RouterLink>
        </p>
      </div>
    </section>

    <div class="paper">
      <!-- SHOWCASE: headline you can type -->
      <section id="try" class="try" aria-labelledby="try-h">
        <h2 id="try-h" class="h-head" v-reveal>Попробуйте прямо здесь</h2>
        <div class="try__line" data-ui v-reveal="80">
          <label class="sr-only" for="try-in">Ваш вопрос</label>
          <input id="try-in" v-model="ask" class="try__in" autocomplete="off" spellcheck="false" />
        </div>
        <div class="try__grid">
          <div class="try__answer" v-reveal="160">
            <ChatFragment
              title="ruAI Lite"
              :messages="[{ role: 'user', text: ask || '…' }, { role: 'assistant', text: answer }]"
              :caret="busy"
            />
          </div>
          <div class="try__ex" v-reveal="240">
            <p>Или возьмите готовый вопрос:</p>
            <button v-for="e in askExamples.slice(1)" :key="e.q" class="try__chip" @click="ask = e.q">{{ e.q }}</button>
          </div>
        </div>
      </section>

      <!-- FEATURES: sentences with switches -->
      <section class="sw" aria-labelledby="sw-h">
        <h2 id="sw-h" class="sr-only">Что умеет ruAI</h2>
        <div v-for="(s, i) in switches" :key="s.text" class="sw__band" :class="on[i] ? BAND[i] : ''">
          <div class="sw__text">
            <p class="sw__claim">{{ s.text }}</p>
            <p v-show="on[i]" class="sw__on">{{ s.on }}</p>
          </div>
          <button
            class="sw__tg"
            role="switch"
            :aria-checked="on[i]"
            :aria-label="s.text"
            data-ui
            @click="on[i] = !on[i]"
          ><span /></button>
        </div>
      </section>

      <!-- HOW: drag through the stages -->
      <section ref="howEl" class="how" aria-labelledby="how-h" @pointerdown="takeOver" @keydown="takeOver">
        <div class="how__left">
          <h2 id="how-h" class="how__clause">
            {{ stages[stage]!.word }}<br />{{ stages[stage]!.clause }}
          </h2>
        </div>
        <div class="how__right">
          <div class="how__ui">
            <ChatFragment title="Новый чат" :messages="stageMsgs" composer="" :typing="stage === 2" />
          </div>
        </div>
        <div class="how__bar">
          <label class="sr-only" for="how-range">Этап</label>
          <input id="how-range" v-model.number="stage" type="range" min="0" max="3" step="1" class="how__range" :style="{ '--v': stage / 3 }" />
          <ol class="how__names">
            <li v-for="(s, i) in stages" :key="s.name" :class="{ on: i === stage }">
              <button @click="stage = i">{{ s.name }}</button>
            </li>
          </ol>
        </div>
      </section>

      <!-- TESTIMONIAL: quotation spread edge to edge -->
      <section class="quote" aria-labelledby="q-h">
        <h2 id="q-h" class="sr-only">Отзыв</h2>
        <blockquote class="quote__q">
          <p class="quote__row" v-reveal><span>«Контент-план</span><span>на месяц</span></p>
          <p class="quote__row" v-reveal="90"><span>за один</span><span>вечер»</span></p>
        </blockquote>
        <p class="quote__by" v-reveal="180"><span>{{ quote.name }}</span><span>{{ quote.role }}</span><span>{{ quote.city }}</span></p>
      </section>

      <!-- PRICING: one plan as a sentence -->
      <section id="price" class="price" aria-labelledby="price-h">
        <h2 id="price-h" class="price__s" v-reveal>
          Неделя ruAI<br />стоит <span class="price__tag">{{ formatPrice(week.price) }} ₽</span>
        </h2>
        <div class="price__foot" v-reveal="120">
          <p>Без VPN и иностранных карт. Продлевается раз в неделю, отменяется в один клик. Месяц — {{ formatPrice(plans[1]!.price) }} ₽, три месяца — {{ formatPrice(plans[2]!.price) }} ₽.</p>
          <div class="price__act">
            <RouterLink :to="{ name: 'checkout', params: { plan: 'week' } }" class="btn-ink">Оформить неделю</RouterLink>
            <RouterLink to="/pricing" class="price__link">Все тарифы</RouterLink>
          </div>
        </div>
      </section>

      <!-- FAQ: large questions, answers beside -->
      <section id="faq" class="faq" aria-labelledby="faq-h">
        <div class="faq__row">
          <h2 id="faq-h" class="faq__q faq__q--head">Вопросы</h2>
        </div>
        <div v-for="f in faq" :key="f.q" class="faq__row" v-reveal>
          <h3 class="faq__q">{{ f.q }}</h3>
          <p class="faq__a">{{ f.a }}</p>
        </div>
      </section>

      <SentenceCta />
    </div>

    <!-- FOOTER: contact as the headline -->
    <footer class="foot">
      <div class="foot__top">
        <p>ruAI · нейросеть без VPN<br />Поддержка ежедневно, 9:00–21:00 МСК</p>
        <a href="#h1" class="foot__up">Наверх</a>
      </div>
      <a class="foot__mail" href="mailto:support@ruai.example">support<br />@ruai.example</a>
      <div class="foot__meta">
        <span><RouterLink to="/chat">Чат</RouterLink> · <RouterLink to="/pricing">Тарифы</RouterLink></span>
        <span>Оплата: МИР, СБП, SberPay</span>
        <span>Россия, {{ new Date().getFullYear() }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.v1 {
  --bg: #38b6ff;
  --surface: #5cc4ff;
  --ink: #071733;
  --muted: #16396b;
  --accent: #071733;
  --accent-ink: #38b6ff;
  --paper: #ffffff;
  --paper-surface: #e6f0f8;
  --paper-muted: #3e5170;
  --f-display: 'Piazzolla', 'PT Serif', Georgia, serif;
  --f-text: 'Piazzolla', 'PT Serif', Georgia, serif;
  --margin: clamp(16px, 2.2vw, 32px);
  --radius: 4px;
  --ui-font: 'Golos Text', 'Onest', system-ui, sans-serif;
  --step-small: clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem);
  --step-body: clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem);
  --step-lead: clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem);
  --step-head: clamp(2rem, 1.3rem + 3.2vw, 4rem);
  background: var(--bg);
  color: var(--ink);
  font: 400 var(--step-body) / 1.5 var(--f-text);
  font-optical-sizing: auto;
}
.v1 ::selection {
  background: var(--ink);
  color: var(--bg);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.btn-ink {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 22px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--bg);
  font: 600 16px var(--f-text);
  transition: transform 0.14s ease;
}
.btn-ink:hover {
  transform: translateY(-2px);
}
.btn-ink:active {
  transform: translateY(1px);
}
.h-head {
  margin: 0;
  font: 500 var(--step-head) / 1 var(--f-display);
  letter-spacing: -0.025em;
}

/* nav */
.nav {
  position: fixed;
  inset: 0 0 auto;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: max(16px, env(safe-area-inset-top)) var(--margin) 16px;
  font-size: 15px;
  mix-blend-mode: normal;
}
.nav--dark {
  color: #fff;
}
.nav--dark .nav__cta {
  background: #38b6ff;
  color: var(--ink);
}
.nav--paper {
  background: var(--paper);
}
.nav {
  transition: background-color 0.3s, color 0.3s;
}
.nav__mark {
  font: 600 22px/1 var(--f-display);
  letter-spacing: -0.03em;
}
.nav__links {
  display: flex;
  gap: 24px;
  margin-left: auto;
}
.nav__links a {
  transition: opacity 0.18s;
}
.nav__links a:hover {
  opacity: 0.6;
}
.nav__cta {
  min-height: 40px;
  font-size: 15px;
}

/* hero */
.hero {
  position: relative;
  height: 220svh;
}
.hero__stage {
  position: sticky;
  top: 0;
  height: 100svh;
  overflow: hidden;
}
.hero__frame {
  position: absolute;
  inset: 0;
  background: transparent;
  pointer-events: auto;
}
.hero__canvas,
.hero__still {
  position: relative;
  width: 100%;
  height: 100%;
}
.hero__canvas {
  display: block;
}
.hero__night {
  position: absolute;
  inset: 0;
  /* deep azure, a few steps darker than the page — the orb reads as lit, not cut out of the night */
  background: radial-gradient(circle at 50% 50%, #0a3d86 0, #0f57ad 45%, #1a74cc 100%);
  will-change: opacity;
}
.hero__still {
  background: radial-gradient(circle at 50% 50%, #c9f1ff 0, #1f8fff 9%, #06142f 22%, transparent 34%);
}
.hero__h {
  position: absolute;
  inset: 50% var(--margin) auto;
  display: flex;
  justify-content: space-between;
  margin: 0;
  transform: translateY(-50%);
  font: 500 clamp(40px, 5.6vw, 100px) / 0.95 var(--f-display);
  letter-spacing: -0.035em;
  pointer-events: none;
}
.hero__half {
  display: block;
  white-space: nowrap;
  opacity: calc(1 - var(--p) * 1.8);
}
.ltr {
  display: inline-block;
  animation: ltr 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  animation-delay: calc(0.35s + var(--i) * 32ms);
}
@keyframes ltr {
  from {
    opacity: 0;
    transform: translateY(0.5em) rotate(6deg);
    filter: blur(6px);
  }
}
.hero__half--l {
  transform: translateX(calc(var(--p) * -30vw));
}
.hero__half--r {
  transform: translateX(calc(var(--p) * 30vw));
  animation-delay: 0.11s;
}
.hero__sub {
  position: absolute;
  left: var(--margin);
  bottom: 32px;
  max-width: 34ch;
  margin: 0;
  font-size: 18px;
  line-height: 1.45;
  animation: rise 0.9s 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.hero__held {
  position: absolute;
  left: var(--margin);
  bottom: 40px;
  max-width: 24ch;
  margin: 0;
  font: 500 var(--step-lead) / 1.25 var(--f-display);
  color: #fff;
}
.hero__held-link {
  display: inline-block;
  margin-top: 16px;
  padding: 10px 18px;
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--ink);
  font: 600 16px var(--f-text);
}

/* paper part of the page */
.paper {
  background: var(--paper);
  padding-inline: var(--margin);
  --surface: var(--paper-surface);
  --muted: var(--paper-muted);
  --accent: var(--ink);
  --accent-ink: var(--bg);
}

/* showcase */
.try {
  padding-block: clamp(120px, 14vw, 200px);
}
.try__line {
  margin-top: 40px;
}
.try__in {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: 500 clamp(40px, 6.4vw, 112px) / 1.05 var(--f-display);
  letter-spacing: -0.035em;
  caret-color: var(--bg);
  text-overflow: ellipsis;
}
.try__in:focus {
  outline: none;
}
.try__line:focus-within {
  box-shadow: 0 6px 0 -2px var(--bg);
}
.try__grid {
  display: grid;
  grid-template-columns: minmax(0, 560px) 1fr;
  gap: 48px clamp(32px, 6vw, 96px);
  margin-top: 48px;
  align-items: start;
}
.try__answer {
  --ui-bg: var(--paper-surface);
  --ui-bubble: #fff;
  min-height: 260px;
}
.try__ex p {
  margin: 0 0 12px;
  font-size: 17px;
}
.try__chip {
  display: block;
  margin: 0 0 6px;
  padding: 6px 0;
  font: 500 var(--step-lead) / 1.2 var(--f-display);
  text-align: left;
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--bg);
  text-decoration-thickness: 3px;
  text-underline-offset: 6px;
  transition: text-underline-offset 0.15s;
}
.try__chip:hover {
  text-underline-offset: 9px;
}

/* switches */
.sw {
  margin-inline: calc(var(--margin) * -1);
}
.sw__band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 20vh;
  padding: 20px var(--margin);
  transition: background-color 0.3s ease, color 0.3s ease;
  color: var(--paper-muted);
}
.sw__band.b-orange,
.sw__band.b-ink,
.sw__band.b-surface {
  color: var(--ink);
}
.b-orange {
  background: #38b6ff;
}
.b-surface {
  background: #a6dbff;
}
.b-ink {
  background: var(--ink);
  color: #38b6ff !important;
}
.sw__claim {
  margin: 0;
  font: 500 clamp(30px, 3.6vw, 60px) / 1.05 var(--f-display);
  letter-spacing: -0.025em;
}
.sw__on {
  margin: 10px 0 0;
  font-size: 17px;
  animation: rise 0.35s ease both;
}
.sw__tg {
  position: relative;
  flex: none;
  width: 2.1em;
  height: 1.1em;
  font-size: clamp(30px, 3.6vw, 60px);
  border-radius: 999px;
  background: var(--paper-surface);
  transition: background-color 0.2s;
}
.sw__tg span {
  position: absolute;
  top: 0.1em;
  left: 0.1em;
  width: 0.9em;
  height: 0.9em;
  border-radius: 50%;
  background: var(--paper-muted);
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.2s;
}
.sw__tg[aria-checked='true'] {
  background: var(--ink);
}
.b-ink .sw__tg[aria-checked='true'] {
  background: #38b6ff;
}
.sw__tg[aria-checked='true'] span {
  transform: translateX(1em);
  background: #fff;
}

/* how */
.how {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr auto;
  min-height: 88svh;
  margin-inline: calc(var(--margin) * -1);
}
.how__left {
  padding: 72px var(--margin) 32px;
  background: var(--ink);
  color: #38b6ff;
}
.how__clause {
  margin: 0;
  max-width: 12ch;
  font: 500 clamp(40px, 4.6vw, 76px) / 1 var(--f-display);
  letter-spacing: -0.03em;
}
.how__right {
  display: grid;
  place-items: center;
  padding: 48px var(--margin);
  background: #38b6ff;
}
.how__ui {
  width: min(440px, 100%);
  min-height: 330px;
}
.how__bar {
  grid-column: 1 / -1;
  padding: 28px var(--margin) 32px;
  background: var(--paper);
}
.how__range {
  width: 100%;
  height: 32px;
  margin: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}
.how__range::-webkit-slider-runnable-track {
  height: 8px;
  background: linear-gradient(90deg, var(--ink) calc(var(--v) * 100%), var(--paper-surface) 0);
}
.how__range::-moz-range-track {
  height: 8px;
  background: var(--paper-surface);
}
.how__range::-moz-range-progress {
  height: 8px;
  background: var(--ink);
}
.how__range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 32px;
  height: 32px;
  margin-top: -12px;
  background: #38b6ff;
  border: 0;
}
.how__range::-moz-range-thumb {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 0;
  background: #38b6ff;
}
.how__range:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 4px;
}
.how__names {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.how__names button {
  font: 400 16px var(--f-text);
  color: var(--paper-muted);
}
.how__names li.on button {
  color: var(--ink);
  font-weight: 600;
}
.how__names li:last-child {
  text-align: right;
}
.how__names li:nth-child(2),
.how__names li:nth-child(3) {
  text-align: center;
}

/* quote */
.quote {
  margin-inline: calc(var(--margin) * -1);
  padding: 140px var(--margin);
  background: var(--paper-surface);
}
.quote__q {
  margin: 0;
}
.quote__row {
  display: flex;
  justify-content: space-between;
  margin: 0 0 0.25em;
  font: 500 clamp(44px, 8.6vw, 150px) / 1 var(--f-display);
  letter-spacing: -0.035em;
}
.quote__by {
  display: flex;
  justify-content: space-between;
  margin: 48px 0 0;
  font-size: 18px;
}

/* price */
.price {
  min-height: 80svh;
  margin-inline: calc(var(--margin) * -1);
  padding: clamp(100px, 12vw, 180px) var(--margin);
  background: #38b6ff;
}
.price__s {
  margin: 0;
  font: 500 clamp(48px, 8.6vw, 150px) / 0.95 var(--f-display);
  letter-spacing: -0.035em;
}
.price__tag {
  display: inline-block;
  padding: 0 0.15em;
  background: var(--ink);
  color: #38b6ff;
}
.price__foot {
  display: grid;
  grid-template-columns: minmax(0, 6fr) minmax(0, 6fr);
  gap: 32px;
  align-items: end;
  margin-top: 64px;
}
.price__foot p {
  max-width: 44ch;
  margin: 0;
  font-size: 20px;
}
.price__act {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}
.price__link {
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* faq */
.faq {
  padding-block: clamp(120px, 14vw, 200px);
}
.faq__row {
  display: grid;
  grid-template-columns: 6fr 1fr 5fr;
  margin-bottom: 80px;
}
.faq__q {
  grid-column: 1;
  margin: 0;
  font: 500 clamp(26px, 2.6vw, 40px) / 1.1 var(--f-display);
  letter-spacing: -0.02em;
}
.faq__q--head {
  color: var(--paper-muted);
}
.faq__a {
  grid-column: 3;
  max-width: 40ch;
  margin: 0.3em 0 0;
  font-size: 18px;
  line-height: 1.55;
}

/* cta lives on paper */
.paper :deep(.sc) {
  --surface: var(--paper-surface);
  --accent: #38b6ff;
  --accent-ink: var(--ink);
}

/* footer */
.foot {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 90svh;
  padding: 40px var(--margin) 28px;
  background: #38b6ff;
}
.foot__top {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  font-size: 15px;
}
.foot__top p {
  margin: 0;
}
.foot__mail {
  align-self: end;
  margin: 80px 0 40px;
  font: 500 clamp(48px, 8.4vw, 150px) / 0.95 var(--f-display);
  letter-spacing: -0.04em;
  transition: opacity 0.18s;
}
.foot__mail:hover {
  opacity: 0.75;
}
.foot__meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 14px;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

@media (max-width: 760px) {
  .nav__links {
    display: none;
  }
  .nav__cta {
    margin-left: auto;
  }
  .hero__h {
    inset: 96px var(--margin) auto;
    transform: none;
    flex-direction: column;
    height: calc(100svh - 96px - 150px);
    justify-content: space-between;
    font-size: 11vw;
  }
  .hero__half--r {
    text-align: right;
  }
  .hero__sub {
    font-size: 16px;
    bottom: 24px;
  }
  .try__grid {
    grid-template-columns: 1fr;
  }
  .try__in {
    font-size: 9vw;
  }
  .try__chip {
    font-size: 20px;
  }
  .sw__band {
    min-height: 132px;
  }
  .sw__claim {
    font-size: 6.4vw;
  }
  .sw__on {
    font-size: 15px;
  }
  .sw__tg {
    font-size: 26px;
  }
  .how {
    grid-template-columns: 1fr;
  }
  .how__right {
    order: -1;
    min-height: 46svh;
  }
  .how__bar {
    order: 0;
  }
  .how__clause {
    font-size: 9vw;
  }
  .quote__row {
    font-size: 11vw;
  }
  .quote__by {
    flex-direction: column;
    gap: 4px;
    font-size: 15px;
  }
  .quote__by span:nth-child(2) {
    text-align: center;
  }
  .quote__by span:nth-child(3) {
    text-align: right;
  }
  .price__s {
    font-size: 11vw;
  }
  .price__foot {
    grid-template-columns: 1fr;
  }
  .price__foot p {
    font-size: 17px;
  }
  .price__act {
    align-items: stretch;
  }
  .btn-ink {
    justify-content: center;
  }
  .faq__row {
    grid-template-columns: 1fr;
    margin-bottom: 56px;
  }
  .faq__q {
    font-size: 24px;
  }
  .faq__a {
    grid-column: 1;
    margin-top: 12px;
    font-size: 17px;
  }
  .foot__mail {
    font-size: 12vw;
  }
  .foot__meta {
    flex-direction: column;
    font-size: 13px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ltr,
  .hero__sub,
  .hero__frame {
    animation: none;
  }
}
</style>
