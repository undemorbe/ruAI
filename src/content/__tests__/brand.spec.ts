import { describe, expect, it } from 'vitest'
// @ts-expect-error — генератор на чистом JS без деклараций
import { SPEC, markPath, tileSvg, weave } from '../../../scripts/brand-mark.mjs'
import adminFavicon from '../../../admin/public/favicon.svg?raw'
import siteFavicon from '../../../public/favicon.svg?raw'
import { MARK_PATH, MARK_STROKE } from '../brand'

describe('brand mark', () => {
  it('three links weave strictly over-under: 6 crossings, 4 per link, alternating', () => {
    const w = weave()
    expect(w.crossings).toHaveLength(6)
    expect(w.perLink).toEqual([4, 4, 4])
    expect(w.alternating).toBe(true)
    // каждое звено сверху ровно в половине своих пересечений
    for (let k = 0; k < 3; k++) {
      const mine = w.crossings.filter((c: { a: number; b: number }) => c.a === k || c.b === k)
      expect(mine.filter((c: { top: number }) => c.top === k)).toHaveLength(2)
    }
  })

  it('under-passes are cut: path has one run per crossing (6), all inside the 64×64 field', () => {
    expect(MARK_PATH.match(/M/g)).toHaveLength(6)
    const nums = MARK_PATH.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const pad = MARK_STROKE / 2
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(pad)
      expect(n).toBeLessThanOrEqual(64 - pad)
    }
  })

  it('generated files are up to date with the generator', () => {
    expect(MARK_PATH).toBe(markPath())
    expect(MARK_STROKE).toBe(SPEC.band)
    expect(siteFavicon).toBe(tileSvg(MARK_PATH))
    expect(adminFavicon).toBe(tileSvg(MARK_PATH))
  })
})
