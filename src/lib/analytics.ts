import { ref } from 'vue'
import type { Router } from 'vue-router'
import { CONSENT_KEY, cleanUrl, hit, loadMetrika, metrikaAllowed, readConsent, saveConsent, type Consent } from './metrika'

/**
 * Согласие на аналитику и запуск Метрики. Выбор хранится в localStorage; пока его нет,
 * App показывает CookieBanner. Без согласия скрипт Метрики не загружается вовсе.
 */

export const consent = ref<Consent | null>(null)

interface Env {
  win: Window
  prod: boolean
}

let router: Router | null = null
let env: Env | null = null
let started = false

const storage = (win: Window): Storage | undefined => {
  try {
    return win.localStorage
  } catch {
    return undefined
  }
}

function start(): void {
  if (started || !router || !env || !metrikaAllowed(env.win.location.hostname, env.prod)) return
  started = true
  const { win } = env
  loadMetrika(win, win.document)
  let prev = win.location.href
  router.afterEach((to, _from, failure) => {
    if (failure) return
    const href = win.location.origin + to.fullPath
    // смена только хэша или служебных параметров - та же страница
    if (cleanUrl(href) !== cleanUrl(prev)) hit(win, href, prev)
    prev = href
  })
}

/** Вызывается из main.ts после монтирования: к этому моменту ResetPage уже убрал токен из адреса. */
export function initAnalytics(r: Router, e: Env = { win: window, prod: import.meta.env.PROD }): void {
  router = r
  env = e
  consent.value = readConsent(storage(e.win))
  if (consent.value === 'granted') start()
}

export function setConsent(c: Consent): void {
  consent.value = c
  if (env) saveConsent(storage(env.win), c)
  if (c === 'granted') start()
  // отзыв после запуска: скрипт Метрики уже в странице, выгрузить его можно только перезагрузкой
  else if (started && env) env.win.location.reload()
}

/** Отозвать или поменять выбор (страница Политики): плашка с вопросом появится снова. */
export function resetConsent(): void {
  consent.value = null
  try {
    if (env) storage(env.win)?.removeItem(CONSENT_KEY)
  } catch {
    // хранилище недоступно: выбор и так не сохранён
  }
}

/** Только для тестов. */
export function resetAnalyticsForTest(): void {
  router = null
  env = null
  started = false
  consent.value = null
}
