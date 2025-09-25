import { Application, Router, send, type Context, type Next } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { registerRouter } from "./api/auth/register.ts";
import { loginRouter } from "./api/auth/login.ts";
import { learnStatusRouter } from "./api/profile/learn_status.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { jwtVerify } from "https://deno.land/x/jose@v5.3.0/jwt/verify.ts";

// ==========================
// 分散式追蹤設定 (Deno 原生實現)
// ==========================

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  tags: Record<string, string | number | boolean>;
  logs: { timestamp: number; fields: Record<string, unknown> }[];
  status: "ok" | "error";
  duration?: number;
}

class SimpleTracer {
  private spans: Map<string, Span> = new Map();
  private activeSpans: Map<string, string> = new Map(); // contextId -> spanId
  private serviceName: string;
  private serviceVersion: string;
  private collectorEndpoint: string;

  constructor(serviceName: string, serviceVersion: string, collectorEndpoint: string) {
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;
    this.collectorEndpoint = collectorEndpoint;
  }

  private generateId(): string {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  }

  private generateTraceId(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  startSpan(operationName: string, parentSpanId?: string): Span {
    const span: Span = {
      traceId: parentSpanId ? this.spans.get(parentSpanId)?.traceId || this.generateTraceId() : this.generateTraceId(),
      spanId: this.generateId(),
      parentSpanId,
      operationName,
      startTime: Date.now(),
      tags: {
        "service.name": this.serviceName,
        "service.version": this.serviceVersion,
      },
      logs: [],
      status: "ok"
    };

    this.spans.set(span.spanId, span);
    return span;
  }

  finishSpan(spanId: string, tags?: Record<string, string | number | boolean>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    
    if (tags) {
      span.tags = { ...span.tags, ...tags };
    }

    // 發送到 OpenTelemetry Collector
    this.exportSpan(span);
  }

  addSpanTags(spanId: string, tags: Record<string, string | number | boolean>): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.tags = { ...span.tags, ...tags };
    }
  }

  logError(spanId: string, error: Error): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.status = "error";
      span.logs.push({
        timestamp: Date.now(),
        fields: {
          "level": "error",
          "message": error.message,
          "stack": error.stack,
        }
      });
    }
  }

  private async exportSpan(span: Span): Promise<void> {
    try {
      // 轉換為 OpenTelemetry 格式
      const otlpSpan = {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.operationName,
        kind: 2, // SPAN_KIND_SERVER
        startTimeUnixNano: span.startTime * 1000000,
        endTimeUnixNano: span.endTime ? span.endTime * 1000000 : Date.now() * 1000000,
        attributes: Object.entries(span.tags).map(([key, value]) => ({
          key,
          value: { stringValue: value.toString() }
        })),
        events: span.logs.map(log => ({
          timeUnixNano: log.timestamp * 1000000,
          name: "log",
          attributes: Object.entries(log.fields).map(([key, value]) => ({
            key,
            value: { stringValue: value?.toString() || "" }
          }))
        })),
        status: {
          code: span.status === "ok" ? 1 : 2
        }
      };

      const payload = {
        resourceSpans: [{
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              { key: "service.version", value: { stringValue: this.serviceVersion } }
            ]
          },
          instrumentationLibrarySpans: [{
            instrumentationLibrary: {
              name: "deno-web-app-tracer",
              version: "1.0.0"
            },
            spans: [otlpSpan]
          }]
        }]
      };

      await fetch(`http://${this.collectorEndpoint}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ERROR] [tracing] 無法發送 trace 數據:`, error);
    }
  }
}

// 初始化 tracer
const tracer = new SimpleTracer(
  "deno-web-app",
  "1.0.0", 
  Deno.env.get("OTEL_COLLECTOR_ENDPOINT") || "otel-collector:4318"
);

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

console.log(`[${new Date().toISOString()}] [INFO] [tracing] Deno 原生追蹤器初始化完成`);

const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) throw new Error("JWT_SECRET 未設定");
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const app = new Application();
const router = new Router();

// ==========================
// 中間件區塊
// ==========================

// 分散式追蹤和指標收集中間件
app.use(async (ctx: Context, next: Next) => {
  const startTime = Date.now();
  const method = ctx.request.method;
  const path = ctx.request.url.pathname;
  
  // 創建 HTTP 請求 span
  const span = tracer.startSpan(`${method} ${path}`);
  
  // 添加 HTTP 相關標籤
  tracer.addSpanTags(span.spanId, {
    "http.method": method,
    "http.url": ctx.request.url.toString(),
    "http.route": path,
    "http.user_agent": ctx.request.headers.get("user-agent") || "",
  });
  
  metricsCollector.incrementConnection();
  
  try {
    // 將 span 存儲在 context 中，供其他中間件使用
    ctx.state.span = span;
    
    await next();
    
    // 設置 span 狀態為成功
    const status = ctx.response.status || 200;
    tracer.addSpanTags(span.spanId, {
      "http.status_code": status,
      "http.response.size": parseInt(ctx.response.headers.get("content-length") || "0"),
    });
    
    if (status >= 400) {
      span.status = "error";
    }
    
  } catch (error) {
    // 記錄錯誤到 span
    tracer.logError(span.spanId, error as Error);
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    const status = ctx.response.status?.toString() || "200";
    
    // 記錄請求持續時間
    tracer.addSpanTags(span.spanId, {
      "http.request.duration_ms": duration,
    });
    
    // 結束 span
    tracer.finishSpan(span.spanId);
    
    // 更新 metrics
    metricsCollector.recordHttpDuration(method, path, duration);
    metricsCollector.incrementHttpRequest(method, status, path);
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
  const parentSpan = ctx.state.span as Span;
  const auth = ctx.request.headers.get("Authorization");
  
  if (auth && auth.startsWith("Bearer ")) {
    // 創建子 span 來追蹤 JWT 驗證過程
    const jwtSpan = tracer.startSpan("JWT Verification", parentSpan.spanId);
    
    tracer.addSpanTags(jwtSpan.spanId, {
      "auth.method": "jwt",
      "auth.token_present": true,
    });
    
    const jwt = auth.replace("Bearer ", "");
    try {
      const { payload } = await jwtVerify(jwt, JWT_SECRET, { algorithms: ["HS256"] });
      ctx.state.user = payload;
      
      tracer.addSpanTags(jwtSpan.spanId, {
        "auth.success": true,
        "auth.user_id": String(payload.sub || payload.userId || "unknown"),
      });
      
    } catch (e) {
      tracer.addSpanTags(jwtSpan.spanId, {
        "auth.success": false,
        "auth.error": e instanceof Error ? e.message : "Unknown error",
      });
      tracer.logError(jwtSpan.spanId, e as Error);
      console.error(`[${new Date().toISOString()}] [ERROR] [JWT] 驗證失敗:`, e);
    } finally {
      tracer.finishSpan(jwtSpan.spanId);
    }
  } else {
    // 記錄無認證令牌的情況
    tracer.addSpanTags(parentSpan.spanId, {
      "auth.token_present": false,
    });
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
const port = parseInt(Deno.env.get("PORT") ?? "");
const host = String(Deno.env.get("HOST") ?? "");
console.log(`[${new Date().toISOString()}] [INFO] [server.ts] Server is running at http://localhost:${port}`);
await app.listen({ port, hostname: host });