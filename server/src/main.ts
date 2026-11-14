import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'

let cfg
try {
  cfg = loadConfig()
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`)
  process.exit(1)
}

const app = buildApp(cfg)
await app.listen({ host: cfg.host, port: cfg.port })
process.stderr.write(`admin api: http://${cfg.host}:${cfg.port}/<ADMIN_PATH>/api/${cfg.demo ? ' (демо-данные)' : ''}\n`)

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0))
  })
}
