/** Хук разрешения модулей для register.ts. Работает только для файлов внутри ../src. */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = new URL('../../src/', import.meta.url)
const SRC_PATH = fileURLToPath(SRC)

type Next = (specifier: string, context: { parentURL?: string }) => Promise<{ url: string }>

function withExt(url: URL): string | null {
  const p = fileURLToPath(url)
  for (const cand of [p, `${p}.ts`, `${p}/index.ts`]) if (existsSync(cand) && !cand.endsWith('/')) return pathToFileURL(cand).href
  return null
}

export async function resolve(specifier: string, context: { parentURL?: string }, next: Next) {
  if (specifier.startsWith('@/')) {
    const url = withExt(new URL(specifier.slice(2), SRC))
    if (url) return { url, shortCircuit: true }
  }
  // относительный импорт без расширения из файла фронтенда
  const parent = context.parentURL
  if (parent?.startsWith('file:') && fileURLToPath(parent).startsWith(SRC_PATH) && /^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
    const url = withExt(new URL(specifier, parent))
    if (url) return { url, shortCircuit: true }
  }
  return next(specifier, context)
}
