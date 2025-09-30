import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "npm:@opentelemetry/semantic-conventions";

import { Application, Router, send, type Context, type Next } from "oak/mod.ts";
import { registerRouter } from "./api/auth/register.ts";
import { loginRouter } from "./api/auth/login.ts";
import { learnStatusRouter } from "./api/profile/learn_status.ts";
import "dotenv/load.ts";
import { jwtVerify } from "jose/jwt/verify.ts";
import { trace, SpanStatusCode } from "@opentelemetry/api";

// ==========================
// OpenTelemetry 追蹤設定 (使用標準 SDK)
// ==========================

const serviceName = "deno-web-app";
const serviceVersion = "1.0.0";

// 決定 OTLP Collector 的端點
// 在 K8s 中，使用服務名稱 (tempo) 和命名空間 (deno-web-app)
// 完整的 FQDN 是 tempo.deno-web-app.svc.cluster.local
const otelCollectorEndpoint = Deno.env.get("OTEL_COLLECTOR_ENDPOINT") || "http://tempo.deno-web-app.svc.cluster.local:4318";

const traceExporter = new OTLPTraceExporter({
  url: `${otelCollectorEndpoint}/v1/traces`,
});

import { AsyncLocalStorageContextManager } from "npm:@opentelemetry/context-async-hooks";

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: "deno-web-app",
  }),
  contextManager: new AsyncLocalStorageContextManager(),
  traceExporter,
  instrumentations: [new HttpInstrumentation()],
});

sdk.start();

console.log(`[${new Date().toISOString()}] [INFO] [tracing] OpenTelemetry SDK started. Exporting traces to ${otelCollectorEndpoint}`);

// 優雅地關閉 SDK
Deno.addSignalListener("SIGINT", () => {
  sdk.shutdown().then(() => console.log("Tracing terminated."));
});
Deno.addSignalListener("SIGTERM", () => {
  sdk.shutdown().then(() => console.log("Tracing terminated."));
});


// ==========================
// 指標收集 (Metrics Collector)
// ==========================
class MetricsCollector {
  private httpRequestsTotal = new Map<string, number>();
  private httpRequestDuration = new Map<string, number[]>();
  private activeConnections = 0;
  private totalConnections = 0;
  private startTime = Date.now();
  
  incrementHttpRequest(method: string, status: string, path: string) {
    const key = `${method}:${status}:${path}`;
    this.httpRequestsTotal.set(key, (this.httpRequestsTotal.get(key) || 0) + 1);
  }
  
  recordHttpDuration(method: string, path: string, duration: number) {
    const key = `${method}:${path}`;
    const durations = this.httpRequestDuration.get(key) || [];
    durations.push(duration);
    // 只保留最近100個請求的時間
    if (durations.length > 100) durations.shift();
    this.httpRequestDuration.set(key, durations);
  }
  
  incrementConnection() {
    this.activeConnections++;
    this.totalConnections++;
  }
  
  decrementConnection() {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }
  
  getMetrics(): string {
    const metrics: string[] = [];
    
    // HTTP 請求總數
    metrics.push("# HELP http_requests_total Total number of HTTP requests");
    metrics.push("# TYPE http_requests_total counter");
    for (const [key, value] of this.httpRequestsTotal) {
      const [method, status, path] = key.split(":");
      metrics.push(`http_requests_total{method="${method}",status="${status}",path="${path}"} ${value}`);
    }
    
    // HTTP 請求延遲
    metrics.push("# HELP http_request_duration_seconds HTTP request duration in seconds");
    metrics.push("# TYPE http_request_duration_seconds histogram");
    for (const [key, durations] of this.httpRequestDuration) {
      const [method, path] = key.split(":");
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      metrics.push(`http_request_duration_seconds{method="${method}",path="${path}"} ${(avg / 1000).toFixed(3)}`);
    }
    
    // 連接數統計
    metrics.push("# HELP http_connections_active Current active HTTP connections");
    metrics.push("# TYPE http_connections_active gauge");
    metrics.push(`http_connections_active ${this.activeConnections}`);
    
    metrics.push("# HELP http_connections_total Total HTTP connections since start");
    metrics.push("# TYPE http_connections_total counter");
    metrics.push(`http_connections_total ${this.totalConnections}`);
    
    // 應用程序正常運行時間
    metrics.push("# HELP app_uptime_seconds Application uptime in seconds");
    metrics.push("# TYPE app_uptime_seconds gauge");
    metrics.push(`app_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}`);
    
    // 記憶體使用量
    const memUsage = Deno.memoryUsage();
    metrics.push("# HELP process_memory_rss_bytes Resident set size in bytes");
    metrics.push("# TYPE process_memory_rss_bytes gauge");
    metrics.push(`process_memory_rss_bytes ${memUsage.rss}`);
    
    metrics.push("# HELP process_memory_heap_used_bytes Heap used in bytes");
    metrics.push("# TYPE process_memory_heap_used_bytes gauge");
    metrics.push(`process_memory_heap_used_bytes ${memUsage.heapUsed}`);
    
    metrics.push("# HELP process_memory_heap_total_bytes Heap total in bytes");
    metrics.push("# TYPE process_memory_heap_total_bytes gauge");
    metrics.push(`process_memory_heap_total_bytes ${memUsage.heapTotal}`);
    
    // 應用程序健康狀態
    metrics.push("# HELP app_healthy Application health status (1 = healthy, 0 = unhealthy)");
    metrics.push("# TYPE app_healthy gauge");
    metrics.push(`app_healthy{service="deno-web-app"} 1`);
    
    return metrics.join("\n") + "\n";
  }
}

const metricsCollector = new MetricsCollector();

const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) throw new Error("JWT_SECRET 未設定");
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const app = new Application();
const router = new Router();

// ==========================
// 中間件區塊
// ==========================

// 指標收集中間件
app.use(async (ctx: Context, next: Next) => {
  const startTime = Date.now();
  metricsCollector.incrementConnection();
  
  try {
    await next();
  } finally {
    const duration = Date.now() - startTime;
    const { method, url } = ctx.request;
    const { status } = ctx.response;
    
    metricsCollector.recordHttpDuration(method, url.pathname, duration);
    metricsCollector.incrementHttpRequest(method, status.toString(), url.pathname);
    metricsCollector.decrementConnection();
  }
});


// 解析 JSON 主體
app.use(async (ctx: Context, next: Next) => {
  if (ctx.request.hasBody) {
    try {
      const body = await ctx.request.body.json();
      ctx.state.body = body;
    } catch (error: unknown) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "無效的 JSON 格式", error: error instanceof Error ? error.message : "未知錯誤" };
      console.error(`[${new Date().toISOString()}] [ERROR] [server.ts] Invalid JSON Format ${ctx.request.url.pathname}`);
      return;
    }
  }
  await next();
});

// JWT 驗證：將驗證結果存入 ctx.state.user
app.use(async (ctx: Context, next: Next) => {
  const auth = ctx.request.headers.get("Authorization");
  const currentSpan = trace.getSpan(trace.context.active());

  if (auth && auth.startsWith("Bearer ")) {
    const jwt = auth.replace("Bearer ", "");
    try {
      const { payload } = await jwtVerify(jwt, JWT_SECRET, { algorithms: ["HS256"] });
      ctx.state.user = payload;
      
      // 在當前的 span 中加入使用者資訊
      currentSpan?.setAttributes({
        "enduser.id": String(payload.sub || payload.userId || "unknown"),
        "auth.success": true,
      });
      
    } catch (e) {
      console.error(`[${new Date().toISOString()}] [ERROR] [JWT] 驗證失敗:`, e);
      currentSpan?.setAttributes({
        "auth.success": false,
        "auth.error": e instanceof Error ? e.message : "Unknown error",
      });
      currentSpan?.setStatus({
        code: SpanStatusCode.ERROR,
        message: "JWT verification failed",
      });
    }
  } else {
     currentSpan?.setAttribute("auth.token_present", false);
  }
  
  await next();
});

app.use(async (ctx: Context, next: Next) => {
  const filePath = ctx.request.url.pathname;
  if (filePath.startsWith("/favicon") || filePath === "/favicon.ico" || filePath === "/site.webmanifest") {
    await send(ctx, filePath, {
      root: `${Deno.cwd()}/public`,
    });
    return;
  }
  await next();
});

// 靜態檔案服務：處理 /static 路徑
app.use(async (ctx: Context, next: Next) => {
  try {
    const path = ctx.request.url.pathname;
    if (path.startsWith("/static")) {
      await send(ctx, path, {
        root: `${Deno.cwd()}`,
      });
      return;
    }
    await next();
  } catch {
    await next();
  }
});

// ==========================
// API 路由（不需 JWT）
// ==========================
app.use(registerRouter.routes());
app.use(registerRouter.allowedMethods());

app.use(loginRouter.routes());
app.use(loginRouter.allowedMethods());

app.use(learnStatusRouter.routes());
app.use(learnStatusRouter.allowedMethods());

// ==========================
// Prometheus Metrics 端點
// ==========================
router.get("/metrics", (ctx: Context) => {
  ctx.response.headers.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  ctx.response.body = metricsCollector.getMetrics();
  
  console.log(`[${new Date().toISOString()}] [INFO] [server.ts] Metrics endpoint accessed`);
});

// ==========================
// 登出導回首頁
// ==========================
router.get("/logout", (ctx: Context) => {
  // 清除客戶端的 token 通過重定向到首頁
  ctx.response.redirect("/index.html");
});

// ==========================
// 路由保護：/profile/*.html 頁面
// ==========================
router.get("/api/:apiName", async (ctx: Context, next: Next) => {
  // JWT 驗證
  if (!ctx.state.user) {
    ctx.response.status = 401;
    ctx.response.body = { success: false, message: "未登入" };
    return;
  }
  await next();
});

// 靜態頁面不驗證 JWT
router.get("/profile/:page", async (ctx) => {
  const requestedPage = ctx.params?.page || "index.html";
  const filePath = `/profile/${requestedPage}`;
  try {
    await send(ctx, filePath, {
      root: `${Deno.cwd()}`,
    });
  } catch {
    ctx.response.status = 404;
    ctx.response.body = "頁面不存在";
    console.error(`[${new Date().toISOString()}] [ERROR] [server.ts] 404 Not Found for ${ctx.request.url.pathname}`);
  }
});

// ==========================
// 一般 HTML 頁面處理
// ==========================
router.get("/(.*)", async (ctx: Context) => {
  try {
    const path = ctx.request.url.pathname;
    let filePath = path;
    if (path === "/" || path === "") {
      filePath = "/index.html";
    }

    await send(ctx, filePath, {
      root: `${Deno.cwd()}/views`,
      index: "index.html",
    });
  } catch (_error) {
    ctx.response.status = 404;
    ctx.response.body = "頁面不存在";
    console.error(`[${new Date().toISOString()}] [ERROR] [server.ts] 404 Not Found for ${ctx.request.url.pathname}`);
  }
});

// ==========================
// 啟動服務
// ==========================
app.use(router.routes());
app.use(router.allowedMethods());
const port = parseInt(Deno.env.get("PORT") ?? "8000");
const host = String(Deno.env.get("HOST") ?? "0.0.0.0");
console.log(`[${new Date().toISOString()}] [INFO] [server.ts] Server is running at http://${host}:${port}`);
await app.listen({ port, hostname: host });