#!/bin/sh
set -eu

# Install with mode 755 in /etc/letsencrypt/renewal-hooks/deploy/.
# Certbot runs deploy hooks only after successful certificate renewal.
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
