import { existsSync } from 'node:fs'
import { Db } from './api/db.ts'
import { ImageFiles } from './api/images.ts'
import { readSettings, writeSettings } from './api/ledger.ts'
import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { sqlRepo } from './sqlRepo.ts'

let cfg
try {
  cfg = loadConfig()
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`)
  process.exit(1)
}

let app
// базу создаёт API сайта; пока её нет - админка без отчётов (501), а не с пустой новой базой.
// server-apply.sh перезапускает API раньше админки, так что после настройки API база уже есть.
const useDb = !!cfg.dbFile && !cfg.demo && existsSync(cfg.dbFile)
if (useDb) {
  // боевой режим: отчёты и настройки - из общей базы сайта
  const db = new Db(cfg.dbFile!)
  app = buildApp(cfg, {
    repo: sqlRepo(db, new ImageFiles(cfg.imagesDir)),
    settings: { settings: () => readSettings(db), saveSettings: (s) => writeSettings(db, s) },
  })
} else app = buildApp(cfg)
await app.listen({ host: cfg.host, port: cfg.port })
process.stderr.write(`admin api: http://${cfg.host}:${cfg.port}/<ADMIN_PATH>/api/${cfg.demo ? ' (демо-данные)' : useDb ? ' (база сайта)' : ' (базы сайта нет - отчёты 501)'}\n`)

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0))
  })
}
