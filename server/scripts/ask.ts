/** Ввод в терминале: секреты — без эха (или из stdin, если он не терминал), обычные значения — с эхом. */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(prompt)
    if (!stdin.isTTY) {
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', (c) => (buf += c))
      stdin.on('end', () => resolve(buf.split('\n')[0] ?? ''))
      return
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    // вставка из менеджера паролей приходит одним куском — разбираем по символам
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          resolve(value)
          return
        } else if (ch === '\u0003') {
          process.exit(130)
        } else if (ch === '\u007f') {
          value = value.slice(0, -1)
        } else {
          value += ch
        }
      }
    }
    stdin.on('data', onData)
  })
}

/** Видимый ввод со значением по умолчанию. */
export async function askVisible(prompt: string, def = ''): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const v = (await rl.question(def ? `${prompt} [${def}]: ` : `${prompt}: `)).trim()
    return v || def
  } finally {
    rl.close()
  }
}
