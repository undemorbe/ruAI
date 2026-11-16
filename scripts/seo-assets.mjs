#!/usr/bin/env node
// Файлы для поисковиков в public/: favicon.ico (16/32/48), favicon-120.png (Яндекс), icon-192.png,
// og.png 1200×630, robots.txt, sitemap.xml, manifest.webmanifest.
// Иконки - из знака бренда (scripts/brand-mark.mjs, public/favicon.svg), тексты - из src/seo/files.ts.
//   node scripts/seo-assets.mjs
// Нужен rsvg-convert (brew install librsvg); для og.png - шрифт Dela Gothic One в системе.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'
import { activeMark, paintAttrs } from './brand-mark.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')
const tmp = mkdtempSync(join(tmpdir(), 'ruai-seo-'))

const raster = (svgFile, px, out) => execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '-o', out, svgFile])

/** ICO из PNG-кадров (формат с PNG внутри поддерживают все современные браузеры и Яндекс). */
export function icoFromPngs(frames) {
  const head = Buffer.alloc(6 + 16 * frames.length)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(frames.length, 4)
  let offset = head.length
  frames.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i
    head.writeUInt8(size >= 256 ? 0 : size, o)
    head.writeUInt8(size >= 256 ? 0 : size, o + 1)
    head.writeUInt16LE(1, o + 4) // planes
    head.writeUInt16LE(32, o + 6) // bpp
    head.writeUInt32LE(data.length, o + 8)
    head.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...frames.map((f) => f.data)])
}

/** Картинка для соцсетей: тёмный фон, знак и заголовок. Без длинных тире. */
export function ogSvg(mark) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <g transform="translate(80 80) scale(1.5)"><rect width="64" height="64" rx="15" fill="#1c1c1c"/>
    <path d="${mark.d}" transform="translate(32 32) scale(.86) translate(-32 -32)" ${paintAttrs(mark, '#f5f5f5')}/></g>
  <text x="200" y="152" font-family="Dela Gothic One" font-size="44" fill="#f5f5f5">ChatGPT</text>
  <text x="80" y="320" font-family="Dela Gothic One" font-size="78" fill="#f5f5f5">ChatGPT на русском</text>
  <text x="80" y="410" font-family="Dela Gothic One" font-size="78" fill="#f5f5f5">без VPN</text>
  <text x="80" y="530" font-family="PT Sans, Helvetica, Arial, sans-serif" font-size="36" fill="#a6a6a6">Оплата картой МИР и через СБП · ru-chatgpt.com</text>
</svg>
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const fav = join(PUB, 'favicon.svg')
    raster(fav, 120, join(PUB, 'favicon-120.png'))
    raster(fav, 192, join(PUB, 'icon-192.png'))
    const frames = [16, 32, 48].map((size) => {
      const f = join(tmp, `ico-${size}.png`)
      raster(fav, size, f)
      return { size, data: readFileSync(f) }
    })
    writeFileSync(join(PUB, 'favicon.ico'), icoFromPngs(frames))

    const og = join(tmp, 'og.svg')
    writeFileSync(og, ogSvg(activeMark()))
    execFileSync('rsvg-convert', ['-w', '1200', '-h', '630', '-o', join(PUB, 'og.png'), og])

    const { module } = await runnerImport(join(ROOT, 'src/seo/files.ts'), {
      configFile: false,
      logLevel: 'error',
      resolve: { alias: { '@': join(ROOT, 'src') } },
    })
    writeFileSync(join(PUB, 'robots.txt'), module.robotsTxt())
    writeFileSync(join(PUB, 'sitemap.xml'), module.sitemapXml())
    writeFileSync(join(PUB, 'manifest.webmanifest'), module.webManifest())
    console.log('seo: иконки, og.png, robots.txt, sitemap.xml, manifest обновлены')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
