import { describe, expect, it } from 'vitest'
import { buildDataset, defaultAdminSettings } from '../demo/dataset'
import { demoRequests, isDemoImage, requestsPageOf } from '../demo/requests'
import { ERROR_LABEL } from '../format'

const NOW = Date.parse('2026-11-16T09:00:00Z')
const ds = buildDataset(NOW)
const feed = demoRequests(ds)
const s = defaultAdminSettings()

describe('демо-лента запросов', () => {
  it('детерминирована, новые сверху, id уникальны', () => {
    expect(demoRequests(buildDataset(NOW))).toEqual(feed)
    expect(feed.length).toBeGreaterThan(100)
    const ids = feed.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < feed.length; i++) expect(Date.parse(feed[i - 1]!.at)).toBeGreaterThanOrEqual(Date.parse(feed[i]!.at))
  })

  it('записи согласованы с набором: пользователи, тариф, ошибки с подписью, картинки-заглушки', () => {
    const users = new Set(ds.users.map((u) => u.id))
    for (const e of feed) {
      expect(users.has(e.userId)).toBe(true)
      if (e.kind !== 'text') expect(e.tier).toBe('media')
      if (e.errorCode) expect(ERROR_LABEL[e.errorCode], e.errorCode).toBeTruthy()
      if (e.status === 'error') expect(e.costUsd).toBe(0)
      for (const p of [...e.photos, ...e.generated]) {
        expect(p.id).toMatch(/^img_[A-Za-z0-9_-]{20}$/)
        expect(isDemoImage(p.id)).toBe(true)
      }
    }
    expect(feed.some((e) => e.generated.length)).toBe(true)
    expect(feed.some((e) => e.photos.length)).toBe(true)
  })

  it('страницы, фильтры и цена в рублях - как у сервера', () => {
    const p1 = requestsPageOf(feed, {}, s)
    expect(p1.items).toHaveLength(30)
    expect(p1.next).toBe(p1.items.at(-1)!.id)
    const p2 = requestsPageOf(feed, { before: p1.next! }, s)
    expect(p2.items[0]!.id).toBeLessThan(p1.next!)
    for (const e of p1.items) expect(e.costRub).toBeCloseTo(e.costUsd * s.usdRub, 2)
    expect(requestsPageOf(feed, { filter: 'image' }, s).items.every((e) => e.kind === 'image')).toBe(true)
    expect(requestsPageOf(feed, { filter: 'error' }, s).items.every((e) => e.status === 'error')).toBe(true)
    const uid = feed[0]!.userId
    expect(requestsPageOf(feed, { userId: uid }, s).items.every((e) => e.userId === uid)).toBe(true)
    expect(requestsPageOf(feed, { userId: 'u_none' }, s)).toEqual({ items: [], next: null })
  })
})
