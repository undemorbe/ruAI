#!/usr/bin/env bash
# Разовая подготовка сервера (идемпотентно, можно запускать повторно). От root, после первой выкладки:
#   bash /opt/ruai/deploy/server-bootstrap.sh
# Пакеты: nginx fail2ban certbot nodejs 24 (NodeSource; в Ubuntu-пакете нет TypeScript) rsync qrencode — ставятся заранее через apt.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

id ruai-admin >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin ruai-admin

install -d -m 755 /var/www/ruai /var/www/ruai/dist /var/www/letsencrypt
install -d -m 750 -o root -g www-data /var/www/ruai-admin
install -d -m 750 -o ruai-admin -g ruai-admin /var/log/ruai-admin
# fail2ban не запустит jail без файла журнала
[ -f /var/log/ruai-admin/auth.log ] || install -m 640 -o ruai-admin -g ruai-admin /dev/null /var/log/ruai-admin/auth.log
[ -f /var/log/nginx/ruai-probe.log ] || install -m 640 -o www-data -g adm /dev/null /var/log/nginx/ruai-probe.log

install -m 644 "$HERE/systemd/ruai-admin.service" /etc/systemd/system/ruai-admin.service
install -m 644 "$HERE/logrotate/ruai-admin" /etc/logrotate.d/ruai-admin
systemctl daemon-reload

install -d -m 755 /etc/nginx/snippets
install -m 644 "$HERE/nginx/ruai-security-headers.conf" /etc/nginx/snippets/ruai-security-headers.conf
install -m 644 "$HERE/nginx/ruai-proxy.conf" /etc/nginx/snippets/ruai-proxy.conf
[ -f /etc/nginx/snippets/ruai-admin.conf ] || echo '# админка не настроена: запустите admin-setup.ts, затем server-apply.sh' > /etc/nginx/snippets/ruai-admin.conf
rm -f /etc/nginx/sites-enabled/default
if [ ! -f /etc/nginx/sites-available/ruai.conf ]; then
  install -m 644 "$HERE/nginx/ruai-bootstrap.conf" /etc/nginx/sites-available/ruai.conf
fi
ln -sf ../sites-available/ruai.conf /etc/nginx/sites-enabled/ruai.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx

install -m 644 "$HERE/fail2ban/filter.d/ruai-admin.conf" /etc/fail2ban/filter.d/ruai-admin.conf
install -m 644 "$HERE/fail2ban/filter.d/ruai-probe.conf" /etc/fail2ban/filter.d/ruai-probe.conf
install -m 644 "$HERE/fail2ban/jail.d/ruai.local" /etc/fail2ban/jail.d/ruai.local
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban
fail2ban-client status | sed -n '2,3p'
echo "bootstrap: ok"
