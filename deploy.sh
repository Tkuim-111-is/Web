#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/myapp"
BRANCH="develop"
DENO_BIN="/home/deployer/.deno/bin/deno"

cd "$APP_DIR"

# 更新程式碼
git fetch --all --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# 可選：預熱快取（加速日後啟動）
if [ -x "$DENO_BIN" ]; then
  $DENO_BIN cache -r server.ts || true
fi

# 重新載入服務
sudo systemctl daemon-reload || true
sudo systemctl restart myapp.service

echo "Deployed and restarted at $(date)"
