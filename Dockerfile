FROM denoland/deno:2.4.4

WORKDIR /app

# 複製依賴宣告檔，優先快取（不含 .env）
COPY deno.json deno.lock import_map.json ./

# 複製原始碼
COPY server.ts ./
COPY api/ ./api/

# 預先快取所有依賴
RUN deno cache server.ts api/auth/login.ts api/auth/register.ts api/profile/learn_status.ts

# 複製其餘靜態資源
COPY public/ ./public/
COPY static/ ./static/
COPY views/ ./views/
COPY profile/ ./profile/

ENV PORT=8000
ENV HOST=0.0.0.0
ENV OTEL_DENO=true

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--allow-write", "server.ts"]
