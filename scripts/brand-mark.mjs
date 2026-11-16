#!/usr/bin/env node
// Знак сервиса: три овальных звена, повёрнутых на 120° и сплетённых строго «над-под».
// Источник правды для src/content/brand.ts, public/favicon.svg и PNG-иконок.
//   node scripts/brand-mark.mjs            — перегенерировать файлы
//   node scripts/brand-mark.mjs --check    — убедиться, что файлы совпадают с генератором (CI/тесты)
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Геометрия знака в поле 64×64. */
export const SPEC = { links: 3, length: 38, width: 26, offset: -10, band: 5.2, gap: 2.2, steps: 720 }

/** Центральные линии звеньев: стадион length×width, сдвинутый от центра на offset и повёрнутый на k·360/links. */
function centerlines({ links, length, width, offset, steps }) {
  const C = 32, R = width / 2, L = length - width, per = 2 * L + Math.PI * width
  const base = []
  for (let i = 0; i < steps; i++) {
    let s = (i / steps) * per, x, y
    if (s < L) [x, y] = [-L / 2 + s, -R]
    else if ((s -= L) < Math.PI * R) { const a = -Math.PI / 2 + s / R; [x, y] = [L / 2 + R * Math.cos(a), R * Math.sin(a)] }
    else if ((s -= Math.PI * R) < L) [x, y] = [L / 2 - s, R]
    else { s -= L; const a = Math.PI / 2 + s / R; [x, y] = [-L / 2 + R * Math.cos(a), R * Math.sin(a)] }
    base.push([x, y - offset])
  }
  return {
    step: per / steps,
    links: Array.from({ length: links }, (_, k) => {
      const a = (k * 2 * Math.PI) / links
      return base.map(([x, y]) => [C + x * Math.cos(a) - y * Math.sin(a), C + x * Math.sin(a) + y * Math.cos(a)])
    }),
  }
}

function intersect(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-12) return null
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { t, u } : null
}

/**
 * Пересечения звеньев и кто сверху. Вдоль каждого звена «над» и «под» чередуются;
 * раскладка распространяется от звена 0 по пересечениям. alternating=false — раскладка противоречива.
 */
export function weave(spec = SPEC) {
  const { links, step } = centerlines(spec)
  const X = []
  for (let i = 0; i < links.length; i++)
    for (let j = i + 1; j < links.length; j++) {
      const A = links[i], B = links[j]
      for (let p = 0; p < A.length; p++)
        for (let q = 0; q < B.length; q++) {
          const h = intersect(A[p], A[(p + 1) % A.length], B[q], B[(q + 1) % B.length])
          if (h) X.push({ a: i, ta: p + h.t, b: j, tb: q + h.u })
        }
    }
  const along = links.map((_, k) =>
    X.map((c, idx) => ({ idx, t: c.a === k ? c.ta : c.b === k ? c.tb : null })).filter((e) => e.t !== null).sort((u, v) => u.t - v.t),
  )
  const parity = links.map(() => null)
  const top = new Map()
  parity[0] = 0
  for (const queue = [0]; queue.length; ) {
    const k = queue.shift()
    along[k].forEach((e, pos) => {
      const c = X[e.idx], other = c.a === k ? c.b : c.a, kOver = (pos + parity[k]) % 2 === 0
      top.set(e.idx, kOver ? k : other)
      if (parity[other] === null) {
        parity[other] = (along[other].findIndex((f) => f.idx === e.idx) + (kOver ? 1 : 0)) % 2
        queue.push(other)
      }
    })
  }
  const alternating = along.every((list, k) => list.every((e, pos) => (top.get(e.idx) === k) === ((pos + parity[k]) % 2 === 0)))
  return { links, step, crossings: X.map((c, i) => ({ ...c, top: top.get(i) })), alternating, perLink: along.map((l) => l.length) }
}

/** SVG-путь знака (обводка шириной SPEC.band): звено, уходящее вниз, прерывается у пересечения. */
export function markPath(spec = SPEC) {
  const { links, step, crossings } = weave(spec)
  const r1 = (v) => Math.round(v * 100) / 100
  const unit = (pts, t) => {
    const i = Math.floor(t) % pts.length, a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
  }
  return links
    .map((pts, k) => {
      const cut = new Array(pts.length).fill(false)
      for (const c of crossings) {
        if ((c.a !== k && c.b !== k) || c.top === k) continue
        const t = c.a === k ? c.ta : c.tb, o = c.a === k ? c.b : c.a, to = c.a === k ? c.tb : c.ta
        const u = unit(pts, t), v = unit(links[o], to)
        const half = (spec.band / 2 + spec.gap) / Math.max(Math.abs(u[0] * v[1] - u[1] * v[0]), 0.2) / step
        for (let j = Math.ceil(t - half); j <= Math.floor(t + half); j++) cut[((j % pts.length) + pts.length) % pts.length] = true
      }
      const start = cut.indexOf(true)
      const runs = []
      let cur = []
      for (let s = 1; s <= pts.length; s++) {
        const j = (start + s) % pts.length
        if (cut[j]) { if (cur.length > 1) runs.push(cur); cur = [] } else cur.push(pts[j])
      }
      if (cur.length > 1) runs.push(cur)
      return runs
        .map((run) => 'M' + run.filter((_, i) => i % 4 === 0 || i === run.length - 1).map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L'))
        .join('')
    })
    .join('')
}

/** Плитка: тёмный скруглённый квадрат, знак светлый, уменьшен до 86% от поля. */
export function tileSvg(d, { bg = '#0a0a0a', fg = '#f5f5f5' } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${bg}"/>` +
    `<path d="${d}" transform="translate(32 32) scale(.86) translate(-32 -32)" fill="none" stroke="${fg}" stroke-width="${SPEC.band}"/></svg>\n`
  )
}

function brandTs(d) {
  return `// Сгенерировано scripts/brand-mark.mjs — не править вручную.
/** Знак сервиса в поле 64×64: обводка шириной MARK_STROKE, без заливки. */
export const MARK_PATH =
  '${d}'
export const MARK_STROKE = ${SPEC.band}
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const w = weave()
  if (!w.alternating || w.crossings.length !== 6) throw new Error(`плетение неверное: ${w.crossings.length} пересечений`)
  const d = markPath()
  const outputs = {
    'src/content/brand.ts': brandTs(d),
    'public/favicon.svg': tileSvg(d),
    'admin/public/favicon.svg': tileSvg(d),
  }
  if (process.argv.includes('--check')) {
    const stale = Object.entries(outputs).filter(([f, s]) => readFileSync(join(ROOT, f), 'utf8') !== s).map(([f]) => f)
    if (stale.length) { console.error('устарели:', stale.join(', ')); process.exit(1) }
    console.log('brand: ok')
  } else {
    for (const [f, s] of Object.entries(outputs)) writeFileSync(join(ROOT, f), s)
    // PNG для iOS/Android — растеризация rsvg-convert (brew install librsvg)
    for (const [f, px] of [['public/apple-touch-icon.png', 180], ['public/icon-512.png', 512]])
      execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '-o', join(ROOT, f), join(ROOT, 'public/favicon.svg')])
    console.log(`brand: ${d.length} символов пути, файлы обновлены`)
  }
}
