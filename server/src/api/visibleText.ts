const TAGS = [
  { open: '<think>', close: '</think>' },
  { open: '<analysis>', close: '</analysis>' },
  { open: '<reasoning>', close: '</reasoning>' },
] as const

const MARKERS = TAGS.flatMap(({ open, close }) => [open, close])

function suffixPrefixLength(value: string, candidates: readonly string[]) {
  const lower = value.toLowerCase()
  const max = Math.min(lower.length, Math.max(...candidates.map((candidate) => candidate.length)) - 1)
  for (let length = max; length > 0; length--) {
    const suffix = lower.slice(-length)
    if (candidates.some((candidate) => candidate.startsWith(suffix))) return length
  }
  return 0
}

/** Removes explicit reasoning blocks and emits only complete visible words. */
export class VisibleTextStream {
  private pending = ''
  private wordBuffer = ''
  private hidden: (typeof TAGS)[number] | null = null

  push(chunk: string): string[] {
    this.pending += chunk
    let visible = ''

    while (this.pending) {
      const lower = this.pending.toLowerCase()
      if (this.hidden) {
        const index = lower.indexOf(this.hidden.close)
        if (index < 0) {
          const keep = suffixPrefixLength(this.pending, [this.hidden.close])
          this.pending = keep ? this.pending.slice(-keep) : ''
          break
        }
        this.pending = this.pending.slice(index + this.hidden.close.length)
        this.hidden = null
        continue
      }

      let found: { index: number; marker: string; tag: (typeof TAGS)[number] | null } | null = null
      for (const tag of TAGS) {
        for (const [marker, nextTag] of [[tag.open, tag], [tag.close, null]] as const) {
          const index = lower.indexOf(marker)
          if (index >= 0 && (!found || index < found.index)) found = { index, marker, tag: nextTag }
        }
      }

      if (found) {
        visible += this.pending.slice(0, found.index)
        this.pending = this.pending.slice(found.index + found.marker.length)
        this.hidden = found.tag
        continue
      }

      const keep = suffixPrefixLength(this.pending, MARKERS)
      visible += this.pending.slice(0, this.pending.length - keep)
      this.pending = keep ? this.pending.slice(-keep) : ''
      break
    }

    this.wordBuffer += visible
    return this.takeCompleteWords()
  }

  flush(): string[] {
    if (!this.hidden) this.wordBuffer += this.pending
    this.pending = ''
    this.hidden = null
    return this.takeCompleteWords(true)
  }

  private takeCompleteWords(final = false): string[] {
    if (final) {
      const words = this.wordBuffer.match(/\S+\s*|\s+/g) ?? []
      this.wordBuffer = ''
      return words
    }

    const boundary = Math.max(this.wordBuffer.lastIndexOf(' '), this.wordBuffer.lastIndexOf('\n'), this.wordBuffer.lastIndexOf('\t'), this.wordBuffer.lastIndexOf('\r'))
    if (boundary < 0) return []
    const ready = this.wordBuffer.slice(0, boundary + 1)
    this.wordBuffer = this.wordBuffer.slice(boundary + 1)
    return ready.match(/\S+\s*|\s+/g) ?? []
  }
}

export function sanitizeVisibleText(text: string): string {
  const stream = new VisibleTextStream()
  return [...stream.push(text), ...stream.flush()].join('')
}
