#!/usr/bin/env bash
# Применяет выкладку из /opt/ruai (её делает deploy/deploy.sh). От root:
#   bash /opt/ruai/deploy/server-apply.sh
# - публичный сайт → /var/www/ruai/dist
# - если есть /etc/ruai-admin.env: админка → /var/www/ruai-admin/<ADMIN_PATH>/, nginx-сниппет, перезапуск сервиса
# - если есть /etc/ruai-api.env: перезапуск API сайта и проверка, что он отвечает
# - если есть сертификат, а включён временный конфиг — включает боевой ruai.conf
set -euo pipefail
R=/opt/ruai
HERE="$R/deploy"
ENV_FILE=/etc/ruai-admin.env
API_ENV=/etc/ruai-api.env
SNIPPET=/etc/nginx/snippets/ruai-admin.conf
source "$HERE/shared-db-permissions.sh"

# пользователи и каталоги API (то же делает bootstrap; здесь — чтобы выкладка не зависела от его повторного запуска)
getent group ruai-data >/dev/null || groupadd --system ruai-data
id ruai-api >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin -g ruai-data ruai-api
install -d -m 700 -o ruai-api -g ruai-data /var/backups/ruai
install -d -m 750 -o ruai-api -g ruai-data /var/log/ruai-api
[ -f /var/log/ruai-api/auth.log ] || install -m 640 -o ruai-api -g ruai-data /dev/null /var/log/ruai-api/auth.log

# юниты, nginx-сниппеты и fail2ban — из выкладки (bootstrap ставит их впервые)
for u in ruai-admin.service ruai-api.service ruai-backup.service ruai-backup.timer; do
  install -m 644 "$HERE/systemd/$u" "/etc/systemd/system/$u"
done
install -m 644 "$HERE/nginx/ruai-proxy.conf" /etc/nginx/snippets/ruai-proxy.conf
install -m 644 "$HERE/nginx/ruai-security-headers.conf" /etc/nginx/snippets/ruai-security-headers.conf
install -m 644 "$HERE/logrotate/ruai-api" /etc/logrotate.d/ruai-api
install -m 644 "$HERE/fail2ban/filter.d/ruai-api.conf" /etc/fail2ban/filter.d/ruai-api.conf
install -m 644 "$HERE/fail2ban/jail.d/ruai.local" /etc/fail2ban/jail.d/ruai.local
systemctl daemon-reload
systemctl enable --now ruai-backup.timer >/dev/null 2>&1
systemctl reload-or-restart fail2ban

# API — раньше сайта и админки: новая сборка сайта ходит в него, админка читает его базу
if [ -f "$API_ENV" ]; then
  [ "$(stat -c %a "$API_ENV")" = "600" ] || { echo "$API_ENV должен быть chmod 600" >&2; exit 1; }
  systemctl enable ruai-api >/dev/null 2>&1
  systemctl restart ruai-api
  ok=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -o /dev/null -H 'X-Requested-With: ruai' http://127.0.0.1:8080/api/billing/plans; then ok=1; break; fi
    sleep 1
  done
  [ "$ok" = 1 ] || { journalctl -u ruai-api -n 30 --no-pager; exit 1; }
  echo "api: ok"
else
  echo "api: не настроен ($API_ENV нет) — сайт работает на демо-режиме"
fi

set_shared_db_permissions /var/lib/ruai/ruai.db ruai-data

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
