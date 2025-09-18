FROM denoland/deno:2.4.4

# 接受 build argument
ARG GIT_COMMIT_HASH=unknown

WORKDIR /app

# 複製專案檔案
COPY . .

# 獲取 git commit hash 並設定為環境變數（優先使用 build argument）
RUN if [ "$GIT_COMMIT_HASH" = "unknown" ]; then \
      git rev-parse --short HEAD > /tmp/git_commit_hash 2>/dev/null || echo "unknown" > /tmp/git_commit_hash; \
    else \
      echo "${GIT_COMMIT_HASH:0:7}" > /tmp/git_commit_hash; \
    fi

# 快取依賴
RUN deno cache server.ts

# 設定環境變數
ENV PORT=8000
ENV GIT_COMMIT_HASH=$(cat /tmp/git_commit_hash 2>/dev/null || echo "unknown")

# 開放端口
EXPOSE 8000
ENV HOST=0.0.0.0

# 啟動應用
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--allow-write", "server.ts"]
