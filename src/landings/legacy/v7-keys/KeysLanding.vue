<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { getPlans } from '@/content/plans'
import { useGoogleFont } from '@/lib/fonts'
import { vReveal } from '@/lib/reveal'
import CallResponse from '../../shared/CallResponse.vue'
import ChatFragment from '../../shared/ChatFragment.vue'
import QuietFooter from '../../shared/QuietFooter.vue'
import SentenceCta from '../../shared/SentenceCta.vue'
import StepPlans from '../../shared/StepPlans.vue'
import TileFaq from '../../shared/TileFaq.vue'
import { useTyping } from '../../shared/useTyping'
import { CODE_TO_KEY } from './keymap'
import type { KeysScene } from './KeysScene'

/**
 * Variant 7 — "ЙЦУКЕН".
 * Idea: the thing every Russian question passes through is the Russian keyboard. The hero is a 3D
 * ЙЦУКЕН board that types along with the visitor — and turns an English layout into Russian on the fly.
 */
useGoogleFont('family=Tektur:wght@500;700&family=Wix+Madefor+Text:wght@400;500;600')
const LABEL_FONT = '"Tektur", "Arial Narrow", sans-serif'

const router = useRouter()
const week = getPlans()[0]!

// ---------- hero: board + screen line ----------
const canvas = ref<HTMLCanvasElement | null>(null)
const heroEl = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const scene = shallowRef<KeysScene | null>(null)
const webgl = ref(true)
const text = ref('')
const demo = ref(true)
const hoverKey = ref(false)
let io: IntersectionObserver | null = null
let visible = true
let demoTimer: ReturnType<typeof setTimeout> | undefined

const DEMO = ['как сварить борщ на четверых', 'письмо в управляющую компанию', 'объясни дроби ребёнку']

function charToId(ch: string) {
  return ch === ' ' ? ' ' : ch.toLowerCase()
}

/** The board performs a phrase until the visitor touches anything. */
async function runDemo() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let n = 0
  const wait = (ms: number) => new Promise<void>((r) => (demoTimer = setTimeout(r, ms)))
  while (demo.value) {
    const phrase = DEMO[n++ % DEMO.length]!
    if (reduced) {
      text.value = phrase
      return
    }
    for (const ch of phrase) {
      if (!demo.value) return
      text.value += ch
      scene.value?.press(charToId(ch))
      await wait(70 + Math.random() * 90)
    }
    await wait(1800)
    while (demo.value && text.value) {
      text.value = text.value.slice(0, -1)
      scene.value?.press('Backspace')
      await wait(28)
    }
    await wait(500)
  }
}
function takeOver() {
  if (!demo.value) return
  demo.value = false
  clearTimeout(demoTimer)
  text.value = ''
}

function submit() {
  const q = text.value.trim()
  router.push({ name: 'chat', query: q ? { q } : {} })
}

function insert(ch: string) {
  const el = input.value
  if (!el) {
    text.value += ch
    return
  }
  const s = el.selectionStart ?? text.value.length
  const e = el.selectionEnd ?? s
  text.value = text.value.slice(0, s) + ch + text.value.slice(e)
  // write through synchronously so fast typing never reads a stale caret
  el.value = text.value
  el.setSelectionRange(s + ch.length, s + ch.length)
}

/** Physical keys: letters map by position, so QWERTY users type Russian too. */
function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
  const id = CODE_TO_KEY[e.code]
  if (!id) return
  takeOver()
  scene.value?.press(id)
  if (id === 'Enter') {
    e.preventDefault()
    submit()
  } else if (id.length === 1 && id !== ' ' && /[а-яё.]/.test(id)) {
    e.preventDefault()
    insert(e.shiftKey ? id.toUpperCase() : id)
  }
}
/** Soft keyboards (no reliable e.code) — light up the key for what was typed. */
function onInput(e: Event) {
  takeOver()
  const ie = e as InputEvent
  const ch = ie.data?.slice(-1)
  if (ch) scene.value?.press(charToId(ch))
  else if (ie.inputType?.startsWith('delete')) scene.value?.press('Backspace')
}
/** Typing anywhere on the hero goes to the screen line. */
function onDocKey(e: KeyboardEvent) {
  if (!visible || e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return
  if (!CODE_TO_KEY[e.code] || e.code === 'Space' || e.code === 'Enter') return
  input.value?.focus()
  onKeydown(e)
}

function ndc(e: PointerEvent): [number, number] {
  const r = canvas.value!.getBoundingClientRect()
  return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]
}
function onCanvasMove(e: PointerEvent) {
  if (!scene.value || e.pointerType !== 'mouse') return
  const id = scene.value.pick(...ndc(e))
  scene.value.setHover(id)
  hoverKey.value = !!id
}
function onCanvasDown(e: PointerEvent) {
  const id = scene.value?.pick(...ndc(e))
  if (!id) return
  takeOver()
  scene.value?.press(id)
  if (id === 'Enter') submit()
  else if (id === 'Backspace') text.value = text.value.slice(0, -1)
  else insert(id)
  if (e.pointerType === 'mouse') input.value?.focus()
}
function onPointer(e: PointerEvent) {
  scene.value?.setTilt((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
}
function onScroll() {
  const el = heroEl.value
  if (!el) return
  scene.value?.setScroll(-el.getBoundingClientRect().top / el.offsetHeight)
}
function onVisibility() {
  if (document.hidden) scene.value?.stop()
  else if (visible) scene.value?.start()
}

// ---------- tasks: a keycap per job ----------
const TASKS = [
  { k: 'П', name: 'Письмо', q: 'Напиши письмо соседям про ремонт', a: 'Добрый день, соседи! С 3 по 14 марта в квартире 47 идёт ремонт. Шумные работы — только с 10:00 до 19:00, в выходные тихо. Если что-то мешает, звоните: +7 900 000-00-00. Спасибо за терпение!' },
  { k: 'У', name: 'Учёба', q: 'Объясни, что такое ВВП', a: 'ВВП — стоимость всего, что страна произвела за год: хлеба, машин, стрижек, программ. Если ВВП растёт, экономика в целом производит больше. Делим на число жителей — получаем ВВП на душу населения.' },
  { k: 'К', name: 'Код', q: 'Регулярка для российского номера телефона', a: 'Подойдёт ^(\\+7|8)[\\s-]?\\(?\\d{3}\\)?[\\s-]?\\d{3}[\\s-]?\\d{2}[\\s-]?\\d{2}$ — принимает +7 и 8, скобки, пробелы и дефисы. Перед сохранением приведите номер к виду +7XXXXXXXXXX.' },
  { k: 'Р', name: 'Резюме', q: 'Сделай резюме короче', a: 'Оставьте три последних места работы, по каждому — две строки результата в цифрах. Навыки сгруппируйте: инструменты, языки, методы. Хобби и школу уберите — освободится полстраницы.' },
  { k: 'Т', name: 'Тексты', q: 'Пост для Telegram про открытие кофейни', a: 'Мы открылись! ☕ С понедельника варим кофе на Садовой, 12. Первую неделю — второй капучино в подарок. Заходите погреться, поработать или просто поболтать с бариста.' },
  { k: 'Д', name: 'Дом', q: 'Меню на неделю за 3000 ₽ на двоих', a: 'Пн — гречка с курицей, Вт — суп с фрикадельками, Ср — макароны по-флотски, Чт — овощное рагу, Пт — плов, Сб — сырники и салат, Вс — запечённая рыба. Список покупок соберу одной таблицей.' },
]
const task = ref(0)
const { text: answer, busy, type } = useTyping(24)
function pick(i: number) {
  task.value = i
  void type(TASKS[i]!.a)
}
const taskMsgs = computed(() => [
  { role: 'user' as const, text: TASKS[task.value]!.q },
  { role: 'assistant' as const, text: answer.value || '…' },
])

onMounted(async () => {
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('keydown', onDocKey)
  document.addEventListener('visibilitychange', onVisibility)
  pick(0)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const small = matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4
  try {
    await Promise.race([document.fonts.load(`500 60px ${LABEL_FONT}`, 'ЙЦУКЕНВвод'), new Promise((r) => setTimeout(r, 2500))])
    const { KeysScene } = await import('./KeysScene')
    if (!canvas.value) return
    scene.value = new KeysScene(canvas.value, {
      quality: small ? 'low' : 'high',
      reducedMotion: reduced,
      font: LABEL_FONT,
      colors: { cap: '#f1ebdd', capInk: '#2a211a', accent: '#e8642c', accentInk: '#fff6ea', space: '#cfc4ae', board: '#3a2e25', glow: '#ffb26b' },
    })
    scene.value.start()
    io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      if (visible && !document.hidden) scene.value?.start()
      else scene.value?.stop()
    })
    if (heroEl.value) io.observe(heroEl.value)
  } catch {
    webgl.value = false
  }
  void runDemo()
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointer)
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('keydown', onDocKey)
  document.removeEventListener('visibilitychange', onVisibility)
  io?.disconnect()
  demo.value = false
  clearTimeout(demoTimer)
  scene.value?.dispose()
})
</script>

<template>
  <div class="v7">
    <header class="nav">
      <RouterLink to="/" class="nav__mark">ruAI</RouterLink>
      <nav class="nav__links" aria-label="Разделы">
        <a href="#tasks">Задачи</a>
        <a href="#price">Цены</a>
        <a href="#faq">Вопросы</a>
      </nav>
      <RouterLink to="/chat" class="nav__cta">Открыть чат</RouterLink>
    </header>

    <section ref="heroEl" class="hero" aria-labelledby="h1">
      <div class="hero__top">
        <h1 id="h1" class="hero__h">Нейросеть на русском без VPN</h1>
        <p class="hero__sub">Наберите вопрос — даже на английской раскладке клавиатура ниже напечатает его по-русски.</p>
      </div>

      <form class="screen" @submit.prevent="submit">
        <label for="q-in" class="sr-only">Ваш вопрос</label>
        <input
          id="q-in"
          ref="input"
          v-model="text"
          class="screen__in"
          :class="{ 'is-demo': demo }"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="send"
          placeholder="Спросите что угодно"
          @keydown="onKeydown"
          @input="onInput"
          @focus="takeOver"
        />
        <button class="screen__go" type="submit">Спросить <span aria-hidden="true">↵</span></button>
      </form>

      <div class="hero__board" :class="{ 'is-hover': hoverKey }">
        <canvas
          v-show="webgl"
          ref="canvas"
          class="hero__canvas"
          aria-hidden="true"
          @pointermove="onCanvasMove"
          @pointerleave="scene?.setHover(null), (hoverKey = false)"
          @pointerdown="onCanvasDown"
        />
      </div>
      <p class="hero__fact">Неделя — {{ week.price }} ₽ · карта МИР, СБП, SberPay</p>
    </section>

    <section id="tasks" class="tasks" aria-labelledby="tasks-h">
      <h2 id="tasks-h" class="h2" v-reveal>Раскладка задач</h2>
      <div class="tasks__grid">
        <div class="caps" role="tablist" aria-label="Задачи">
          <button
            v-for="(t, i) in TASKS"
            :key="t.k"
            class="cap"
            :class="{ on: task === i }"
            role="tab"
            :aria-selected="task === i"
            @click="pick(i)"
          >
            <span class="cap__k">{{ t.k }}</span>
            <span class="cap__n">{{ t.name }}</span>
          </button>
        </div>
        <div class="tasks__out" role="tabpanel">
          <ChatFragment title="ruAI Lite" :messages="taskMsgs" :caret="busy" />
          <RouterLink :to="{ name: 'chat', query: { q: TASKS[task]!.q } }" class="tasks__link">Задать этот вопрос в чате →</RouterLink>
        </div>
      </div>
    </section>

    <div class="band"><CallResponse /></div>
    <div id="price" class="wrap"><StepPlans title="Сколько стоит" /></div>
    <div id="faq" class="wrap"><TileFaq /></div>
    <div class="wrap"><SentenceCta /></div>
    <div class="wrap"><QuietFooter /></div>
  </div>
</template>

<style scoped>
.v7 {
  --bg: #ddd5c4;
  --surface: #cfc5b0;
  --ink: #241c15;
  --muted: #5e5246;
  --accent: #e8642c;
  --accent-ink: #fff6ea;
  --accent-hover: #cf5420;
  --f-display: 'Tektur', 'Arial Narrow', sans-serif;
  --f-text: 'Wix Madefor Text', 'Golos Text', system-ui, sans-serif;
  --margin: clamp(16px, 3vw, 44px);
  --radius: 10px;
  --h-weight: 700;
  --h-case: none;
  --sc-weight: 700;
  --plan-1: #f1ebdd;
  --plan-1-ink: #241c15;
  --plan-2: #e8642c;
  --plan-2-ink: #fff6ea;
  --plan-3: #3a2e25;
  --plan-3-ink: #f1ebdd;
  --ui-bg: #f8f4ea;
  --ui-ink: #241c15;
  --ui-soft: #7a6c5d;
  --ui-bubble: #ebe3d2;
  --ui-accent: #e8642c;
  --ui-accent-ink: #fff6ea;
  --ui-font: 'Wix Madefor Text', system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
  font: 400 clamp(1rem, 0.96rem + 0.2vw, 1.125rem) / 1.55 var(--f-text);
  overflow-x: clip;
}
.v7 ::selection {
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
  margin: 0 0 clamp(28px, 4vw, 48px);
  font: 700 clamp(2rem, 1.3rem + 3vw, 4rem) / 1 var(--f-display);
  letter-spacing: -0.01em;
}

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
  font: 700 24px/1 var(--f-display);
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
  font-weight: 600;
  transition: background-color 0.2s;
}
.nav__cta:hover {
  background: var(--accent);
}

/* hero */
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: max(100svh, 700px);
  padding: calc(96px + env(safe-area-inset-top, 0px)) var(--margin) calc(24px + env(safe-area-inset-bottom, 0px));
  overflow: hidden;
}
.hero__top {
  max-width: 46rem;
}
.hero__h {
  margin: 0;
  font: 700 clamp(2.25rem, 1.2rem + 4vw, 5rem) / 0.98 var(--f-display);
  letter-spacing: -0.015em;
}
.hero__sub {
  max-width: 34rem;
  margin: 18px 0 0;
  color: var(--muted);
  font-size: clamp(1.0625rem, 1rem + 0.3vw, 1.25rem);
}
.screen {
  display: flex;
  gap: 10px;
  width: min(54rem, 100%);
  margin: clamp(24px, 4vh, 44px) 0 0;
}
.screen__in {
  flex: 1;
  min-width: 0;
  min-height: 60px;
  padding: 0 20px;
  border: 0;
  border-radius: var(--radius);
  background: #2a211a;
  color: #ffd9a8;
  font: 500 clamp(1.125rem, 1rem + 0.8vw, 1.625rem) var(--f-display);
  letter-spacing: 0.01em;
  caret-color: var(--accent);
}
.screen__in::placeholder {
  color: #8a7660;
}
.screen__in.is-demo {
  color: #c9b08e;
}
.screen__in:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
.screen__go {
  min-height: 60px;
  padding: 0 22px;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-ink);
  font: 700 1.0625rem var(--f-display);
  white-space: nowrap;
  transition: background-color 0.2s, transform 0.15s;
}
.screen__go:hover {
  background: var(--accent-hover);
}
.screen__go:active {
  transform: translateY(2px);
}
.hero__board {
  position: relative;
  flex: 1;
  min-height: 300px;
  margin: 8px calc(var(--margin) * -1) 0;
}
.hero__board.is-hover {
  cursor: pointer;
}
.hero__canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
}
.hero__fact {
  margin: 0;
  color: var(--muted);
  font-size: 0.9375rem;
}

/* tasks */
.tasks {
  padding: clamp(96px, 11vw, 160px) var(--margin);
}
.tasks__grid {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: clamp(24px, 4vw, 64px);
  align-items: start;
}
.caps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.cap {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  aspect-ratio: 1;
  padding: 14px;
  border-radius: 12px;
  background: #f1ebdd;
  /* key depth: a solid lower edge, pressed when selected */
  box-shadow: 0 6px 0 #b6a98f;
  text-align: left;
  transition: transform 0.12s, box-shadow 0.12s, background-color 0.2s;
}
.cap:hover {
  background: #fbf7ee;
}
.cap:active,
.cap.on {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #b6a98f;
}
.cap.on {
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 0 2px 0 #a8441a;
}
.cap:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 3px;
}
.cap__k {
  font: 700 clamp(1.75rem, 1.2rem + 2vw, 2.75rem) / 1 var(--f-display);
}
.cap__n {
  font-weight: 600;
}
.tasks__out :deep(.cf) {
  min-height: 300px;
}
.tasks__link {
  display: inline-block;
  margin-top: 16px;
  color: var(--accent-hover);
  font-weight: 600;
}
.tasks__link:hover {
  text-decoration: underline;
}
.band {
  padding: clamp(64px, 8vw, 120px) var(--margin);
  background: #3a2e25;
  color: #f1ebdd;
  --surface: #4a3c31;
}

@media (max-width: 860px) {
  .nav__links {
    display: none;
  }
  .nav__cta {
    margin-left: auto;
  }
  .screen {
    flex-direction: column;
  }
  .hero__board {
    min-height: 220px;
  }
  .tasks__grid {
    grid-template-columns: 1fr;
  }
}
</style>
