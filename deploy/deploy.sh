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

# бэкенда сайта пока нет — публичная сборка работает на моках
VITE_USE_MOCKS=true npm run build
npx vite build --config vite.admin.config.ts

# только production-зависимости сервера админки (fastify — чистый JS)
MODS="$(mktemp -d)"
trap 'rm -rf -- "$MODS"' EXIT
cp server/package.json server/package-lock.json "$MODS/"
npm ci --omit=dev --no-audit --no-fund --prefix "$MODS" >/dev/null

ssh "$HOST" 'install -d -m 755 /opt/ruai'
# node_modules кладёт следующий rsync; exclude защищает каталог от --delete здесь
rsync -azR --delete --exclude '*.test.ts' --exclude '__tests__' --exclude '/server/node_modules' \
  ./package.json ./dist ./dist-admin ./deploy ./server/package.json ./server/src ./server/scripts ./src/admin/demo \
  "$HOST:/opt/ruai/"
rsync -az --delete "$MODS/node_modules/" "$HOST:/opt/ruai/server/node_modules/"
ssh "$HOST" 'chown -R root:root /opt/ruai && chmod -R go-w /opt/ruai && bash /opt/ruai/deploy/server-apply.sh'
