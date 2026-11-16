/**
 * Журнал в stdout (его собирает journald). Пишем только события и числовые id —
 * ни текстов сообщений, ни имён, ни username. Секреты дополнительно вырезаются из всех строк.
 */

export type LogFields = Record<string, string | number | boolean | null | undefined>
export type Logger = (event: string, fields?: LogFields) => void

export function createLogger(secrets: string[], write: (line: string) => void = (l) => console.log(l)): Logger {
  const hidden = secrets.filter((s) => s.length >= 8)
  const clean = (s: string) => hidden.reduce((acc, sec) => acc.split(sec).join('***'), s).replace(/[\r\n]+/g, ' ')
  return (event, fields = {}) => {
    const parts = [clean(event)]
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue
      parts.push(`${k}=${typeof v === 'string' ? JSON.stringify(clean(v)) : String(v)}`)
    }
    write(parts.join(' '))
  }
}

export const silentLogger: Logger = () => {}
