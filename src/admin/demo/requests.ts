/**
 * Демо-лента запросов (мок админки и сервер с ADMIN_DEMO=1): записи строятся из суточных
 * расходов демо-набора, тексты - из короткого списка примеров, картинки - серые заглушки.
 */
import type { AdminSettings, RequestEntry, RequestsPage, RequestsQuery } from '../api/types'
import type { Dataset } from './dataset'

const DAY = 86_400_000
const PAGE = 30

const TEXTS: [string, string][] = [
  ['Помоги составить письмо арендодателю о задержке оплаты на неделю', 'Здравствуйте! Пишу, чтобы предупредить: оплата аренды за этот месяц задержится примерно на неделю...'],
  ['Объясни простыми словами, что такое инфляция', 'Инфляция - это рост цен со временем: на ту же сумму денег можно купить меньше товаров...'],
  ['Придумай 5 названий для кофейни у метро', '1. «Утренний рейс» 2. «Зерно и пар» 3. «На бегу» 4. «Пересадка» 5. «Тёплая станция»'],
  ['Переведи на английский: «Спасибо, что дождались ответа»', 'Thank you for waiting for our reply.'],
  ['Как посчитать проценты по вкладу с капитализацией?', 'Формула: итог = сумма × (1 + ставка / n)^(n × лет), где n - число капитализаций в год...'],
  ['Напиши план тренировок на 3 дня в неделю для новичка', 'День 1: присед, отжимания, тяга гантели. День 2: выпады, планка, жим над головой...'],
]
const VISION: [string, string][] = [
  ['Что за растение на фото и как за ним ухаживать?', 'Похоже на монстеру. Ей нужен рассеянный свет, полив раз в неделю, когда верхний слой почвы просох...'],
  ['', 'На фото чек из магазина: 7 позиций на сумму 1 284 ₽. Самая дорогая - сыр, 459 ₽.'],
]
const IMAGES: [string, string][] = [
  ['Нарисуй рыжего кота в космическом шлеме, акварель', 'Готово: рыжий кот в шлеме на фоне звёзд, акварельная техника.'],
  ['Сделай логотип для пекарни «Колосок», минимализм', 'Вот вариант логотипа: колос в круге, тёплые бежевые тона.'],
]

/** Детерминированный выбор по номеру записи: демо-лента одинакова при каждом запуске. */
const at = <T>(list: T[], n: number) => list[n % list.length]!

export function demoRequests(ds: Dataset): RequestEntry[] {
  const logins = new Map(ds.users.map((u) => [u.id, u.login]))
  const out: RequestEntry[] = []
  let n = 0
  const recent = ds.usage.filter((u) => u.day >= ds.now - 14 * DAY).sort((a, b) => a.day - b.day || a.userId.localeCompare(b.userId))
  for (const u of recent) {
    const count = Math.min(u.requests, 3)
    const textUsd = u.textUsd / Math.max(1, u.requests)
    const imageUsd = u.generations ? u.imageUsd / u.generations : 0
    for (let i = 0; i < count; i++) {
      n++
      const kind: RequestEntry['kind'] = u.tier === 'media' && i < u.generations ? 'image' : u.tier === 'media' && n % 4 === 0 ? 'vision' : 'text'
      const failed = i === 0 && Object.keys(u.errors).length > 0
      const [prompt, answer] = kind === 'image' ? at(IMAGES, n) : kind === 'vision' ? at(VISION, n) : at(TEXTS, n)
      const cost = failed ? 0 : textUsd + (kind === 'image' ? imageUsd : 0)
      const time = Math.min(ds.now - 60_000, u.day + ((n * 7919) % DAY))
      const pic = (tag: string) => ({ id: `img_demo${tag}${String(n).padStart(15, '0')}`, width: 1024, height: 1024 })
      out.push({
        id: 0,
        at: new Date(time).toISOString(),
        userId: u.userId,
        login: logins.get(u.userId) ?? 'удалён',
        kind,
        tier: u.tier,
        model: kind === 'image' ? 'демо: генерация' : `демо: ${u.tier}`,
        status: failed ? 'error' : 'ok',
        errorCode: failed ? Object.keys(u.errors)[0]! : null,
        tokensIn: Math.round(u.tokensIn / Math.max(1, u.requests)),
        tokensOut: failed ? 0 : Math.round(u.tokensOut / Math.max(1, u.requests)),
        costUsd: Math.round(cost * 1e6) / 1e6,
        costRub: 0,
        chatId: `c_demo${n}`,
        chatTitle: (prompt || 'Фото').slice(0, 48),
        prompt,
        answer: failed ? null : answer,
        clipped: false,
        truncated: false,
        photos: kind === 'vision' ? [pic('p')] : [],
        generated: kind === 'image' && !failed ? [pic('g')] : [],
      })
    }
  }
  out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  out.forEach((e, i) => (e.id = i + 1))
  return out.reverse()
}

/** Та же выборка и страницы, что у сервера (server/src/requests.ts). */
export function requestsPageOf(all: RequestEntry[], q: RequestsQuery, s: AdminSettings): RequestsPage {
  const f = q.filter ?? 'all'
  const rows = all.filter(
    (e) =>
      (!q.userId || e.userId === q.userId) &&
      (!q.before || e.id < q.before) &&
      (f === 'all' ? true : f === 'error' ? e.status === 'error' : e.kind === f),
  )
  const items = rows.slice(0, PAGE).map((e) => ({ ...e, costRub: Math.round(e.costUsd * s.usdRub * 100) / 100 }))
  return { items, next: rows.length > PAGE ? items.at(-1)!.id : null }
}

/** Заглушка вместо картинки в демо: серый квадрат с подписью. */
export const DEMO_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#d9d9de"/><text x="128" y="134" font-family="sans-serif" font-size="20" fill="#6b6b75" text-anchor="middle">демо</text></svg>'
export const isDemoImage = (id: string) => id.startsWith('img_demo')
