#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/Web"
DENO_BIN="/home/deployer/.deno/bin/deno"

cd "$APP_DIR"

# 預熱 Deno 快取（不影響執行失敗時重啟）
[ -x "$DENO_BIN" ] && $DENO_BIN cache -r server.ts || true

sudo systemctl daemon-reload || true
sudo systemctl restart deno-web.service

echo "Restarted at $(date)"
