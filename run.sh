#!/bin/bash

# 尋找佔用該埠的進程 ID 並終止
PID=$(lsof -ti tcp:$DENO_PORT)
if [ -n "$PID" ]; then
    kill -9 $PID
    echo "已終止佔用 $DENO_PORT 埠的進程 (PID: $PID)。"
fi

# 建立 logs 資料夾（如不存在）
mkdir -p ./logs

# 設定時間戳
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 啟動 Deno 並記錄日誌
nohup deno run --allow-net --allow-read --allow-env server.ts > ./logs/log_$TIMESTAMP.log 2>&1 &
