#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/deployer/web"
DENO_BIN="/home/deployer/.deno/bin/deno"

cd "$APP_DIR"

# 預熱 Deno 快取（不影響執行失敗時重啟）
[ -x "$DENO_BIN" ] && $DENO_BIN cache -r server.ts || true

export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user daemon-reload || true
systemctl --user restart deno-web.service

echo "Restarted at $(date)"
