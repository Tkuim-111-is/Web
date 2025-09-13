#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --allow-sys

/**
 * 簡化的應用程式啟動腳本，用於測試
 */

import { Application, Router } from "https://deno.land/x/oak/mod.ts";

const app = new Application();
const router = new Router();

// 簡單的健康檢查端點
router.get("/health", (ctx) => {
  ctx.response.body = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: {
      name: "deno-web-app",
      version: "1.0.0",
    },
  };
});

router.get("/ready", (ctx) => {
  ctx.response.body = {
    status: "ready",
    timestamp: new Date().toISOString(),
  };
});

router.get("/live", (ctx) => {
  ctx.response.body = {
    status: "alive",
    timestamp: new Date().toISOString(),
  };
});

router.get("/metrics", (ctx) => {
  const metrics = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health"} 1

# HELP service_info Service information
# TYPE service_info gauge
service_info{service="deno-web-app",version="1.0.0"} 1
`.trim();

  ctx.response.headers.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  ctx.response.body = metrics;
});

app.use(router.routes());
app.use(router.allowedMethods());

const port = 8000;
console.log(`[${new Date().toISOString()}] [INFO] Simple server running at http://localhost:${port}`);
console.log("Available endpoints:");
console.log("- GET /health");
console.log("- GET /ready");
console.log("- GET /live");
console.log("- GET /metrics");

await app.listen({ port });
