#!/usr/bin/env bash
# Выкладка с локальной машины: проверки → сборка → rsync в /opt/ruai → server-apply.sh.
#   deploy/deploy.sh            (хост ruai-vps из ~/.ssh/config)
#   DEPLOY_HOST=other deploy/deploy.sh
set -euo pipefail
HOST="${DEPLOY_HOST:-ruai-vps}"
cd "$(dirname "$0")/.."

npm run lint
npm run typecheck
npm test
(cd server && npm test && npx tsc --noEmit)

# Сайт ходит в настоящий API, только если на сервере он настроен (/etc/ruai-api.env), иначе — демо на моках.
# Переопределить: DEPLOY_API=1 (настоящий) или DEPLOY_API=0 (демо).
if [ -z "${DEPLOY_API:-}" ]; then
  if ssh "$HOST" 'test -f /etc/ruai-api.env'; then DEPLOY_API=1; else DEPLOY_API=0; fi
fi
if [ "$DEPLOY_API" = 1 ]; then
  echo "сборка сайта: настоящий API (/api)"
  VITE_USE_MOCKS=false VITE_API_URL=/api npm run build
else
  echo "сборка сайта: демо на моках"
  VITE_USE_MOCKS=true VITE_API_URL= npm run build
fi
npx vite build --config vite.admin.config.ts

# только production-зависимости сервера (fastify, multipart, nodemailer — чистый JS)
MODS="$(mktemp -d)"
trap 'rm -rf -- "$MODS"' EXIT
cp server/package.json server/package-lock.json "$MODS/"
npm ci --omit=dev --no-audit --no-fund --prefix "$MODS" >/dev/null

ssh "$HOST" 'install -d -m 755 /opt/ruai'
# node_modules кладёт следующий rsync; exclude защищает каталог от --delete здесь
# ./src — общие правила (тарифы, лимиты, типы), которые сервер импортирует через src/register.ts
rsync -azR --delete --exclude '*.test.ts' --exclude '*.spec.ts' --exclude '__tests__' --exclude 'testkit.ts' --exclude '/server/node_modules' --exclude '/server/.data' \
  ./package.json ./dist ./dist-admin ./deploy ./server/package.json ./server/src ./server/scripts ./src \
  "$HOST:/opt/ruai/"
rsync -az --delete "$MODS/node_modules/" "$HOST:/opt/ruai/server/node_modules/"
ssh "$HOST" 'chown -R root:root /opt/ruai && chmod -R go-w /opt/ruai && bash /opt/ruai/deploy/server-apply.sh'

# Сообщить Яндексу об обновлении страниц (только боевой хост; отключить: INDEXNOW=0). Ошибка не ломает выкладку.
if [ "$HOST" = ruai-vps ] && [ "${INDEXNOW:-1}" != 0 ]; then
  node scripts/indexnow.mjs || echo "IndexNow: не отправлено"
fi
