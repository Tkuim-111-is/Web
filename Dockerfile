FROM denoland/deno:2.4.4

# 接受 build argument
ARG GIT_COMMIT_HASH=unknown

WORKDIR /app

# 複製專案檔案
COPY . .

# 快取依賴
RUN deno cache server.ts

# 設定環境變數
ENV PORT=8000

# 開放端口
EXPOSE 8000
ENV HOST=0.0.0.0

# 啟動應用
CMD ["sh", "-c", "if [ \"$GIT_COMMIT_HASH\" != \"unknown\" ]; then export GIT_COMMIT_HASH=\"${GIT_COMMIT_HASH:0:7}\"; else export GIT_COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo \"unknown\"); fi && deno run --allow-net --allow-read --allow-env --allow-run server.ts"]
