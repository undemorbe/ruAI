#!/usr/bin/env bash
# Применяет выкладку из /opt/ruai (её делает deploy/deploy.sh). От root:
#   bash /opt/ruai/deploy/server-apply.sh
# - публичный сайт → /var/www/ruai/dist
# - если есть /etc/ruai-admin.env: админка → /var/www/ruai-admin/<ADMIN_PATH>/, nginx-сниппет, перезапуск сервиса
# - если есть сертификат, а включён временный конфиг — включает боевой ruai.conf
set -euo pipefail
R=/opt/ruai
HERE="$R/deploy"
ENV_FILE=/etc/ruai-admin.env
SNIPPET=/etc/nginx/snippets/ruai-admin.conf

rsync -a --delete "$R/dist/" /var/www/ruai/dist/

if [ -f "$ENV_FILE" ]; then
  [ "$(stat -c %a "$ENV_FILE")" = "600" ] || { echo "$ENV_FILE должен быть chmod 600" >&2; exit 1; }
  P="$(grep -E '^ADMIN_PATH=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d "'\"")"
  if [[ ! "$P" =~ ^[A-Za-z0-9_-]{32,128}$ ]]; then
    echo "ADMIN_PATH в $ENV_FILE не найден или неверен" >&2
    exit 1
  fi
  install -d -m 750 -o root -g www-data "/var/www/ruai-admin/$P"
  rsync -a --delete --chown=root:www-data --chmod=D750,F640 "$R/dist-admin/" "/var/www/ruai-admin/$P/"
  TMP="$(mktemp)"
  sed "s/__ADMIN_PATH__/${P}/g" "$HERE/nginx/ruai-admin.conf.template" > "$TMP"
  install -m 640 -o root -g www-data "$TMP" "$SNIPPET"
  rm -f -- "$TMP"
  systemctl enable ruai-admin >/dev/null 2>&1
  systemctl restart ruai-admin
  sleep 1
  systemctl is-active --quiet ruai-admin || { journalctl -u ruai-admin -n 20 --no-pager; exit 1; }
  echo "admin: ok (/${P:0:4}…/)"
else
  echo '# админка не настроена: запустите admin-setup.ts, затем server-apply.sh' > "$SNIPPET"
  echo "admin: не настроена ($ENV_FILE нет)"
fi

if [ -f /etc/letsencrypt/live/ru-chatgpt.com/fullchain.pem ]; then
  install -m 644 "$HERE/nginx/ruai.conf" /etc/nginx/sites-available/ruai.conf
else
  install -m 644 "$HERE/nginx/ruai-bootstrap.conf" /etc/nginx/sites-available/ruai.conf
  echo "tls: сертификата нет — включён временный HTTP-конфиг"
fi
nginx -t 2>&1 | tail -1
systemctl reload nginx
echo "apply: ok"
