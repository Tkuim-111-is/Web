FROM denoland/deno:2.4.4

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
CMD ["run", "--allow-net", "--allow-read", "--allow-env", "--allow-write", "server.ts"]
