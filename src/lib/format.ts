const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export const formatPrice = (n: number) => rub.format(n)

/** Price per day, rounded to whole rubles. */
export const perDay = (price: number, days: number) => Math.round(price / Math.max(days, 1))

export function pluralRu(n: number, forms: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return forms[0]
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1]
  return forms[2]
}

export type Block = { kind: 'text'; text: string } | { kind: 'code'; lang: string; text: string }

/** Splits a message into text and fenced code blocks. Rendered with text bindings — no v-html. */
export function splitBlocks(src: string): Block[] {
  const blocks: Block[] = []
  const re = /```([\w+-]*)\n?([\s\S]*?)(```|$)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m.index > last) blocks.push({ kind: 'text', text: src.slice(last, m.index) })
    blocks.push({ kind: 'code', lang: m[1] ?? '', text: (m[2] ?? '').replace(/\n$/, '') })
    last = re.lastIndex
    if (m[0].length === 0) break
  }
  if (last < src.length) blocks.push({ kind: 'text', text: src.slice(last) })
  return blocks.filter((b) => b.kind === 'code' || b.text.trim() !== '')
}
