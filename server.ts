import { Application, Router, send, type Context, type Next } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { registerRouter } from "./api/auth/register.ts";
import { loginRouter } from "./api/auth/login.ts";
import { learnStatusRouter } from "./api/profile/learn_status.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { jwtVerify } from "https://deno.land/x/jose@v5.3.0/jwt/verify.ts";
import { trace, Span, SpanStatusCode } from "npm:@opentelemetry/api@1";

// ==========================
// OpenTelemetry 追蹤設定
// ==========================

// 創建 OTLP 導出器
class DenoOTLPExporter {
  private collectorEndpoint: string;
  private serviceName: string;
  private serviceVersion: string;
  private spanBuffer: Array<{ span: Span; spanName: string; startTime: number; endTime: number; parentSpanId?: string }> = [];
  private batchTimeout: number | null = null;

  constructor(serviceName: string, serviceVersion: string, collectorEndpoint: string) {
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;
    this.collectorEndpoint = collectorEndpoint;
  }

  // 批量導出 spans
  async exportSpan(span: Span, spanName: string, startTime: number, endTime: number, parentSpanId?: string): Promise<void> {
    // 將 span 加入緩衝區
    this.spanBuffer.push({ span, spanName, startTime, endTime, parentSpanId });
    
    // 立即導出（確保數據可見性）
    await this.flushSpans();
  }

  private async flushSpans(): Promise<void> {
    if (this.spanBuffer.length === 0) return;
    
    try {
      const spans = this.spanBuffer.splice(0); // 取出所有spans並清空緩衝區
      const otlpSpans = spans.map(({ span, spanName, startTime, endTime, parentSpanId }) => {
        const spanContext = span.spanContext();
        const spanData = span as unknown as { 
          _attributes?: Record<string, unknown>;
          _status?: { code: SpanStatusCode };
        };
        
        // 確保所有必要的屬性都被正確設置
        const baseAttributes = [
          { key: "service.name", value: { stringValue: this.serviceName } },
          { key: "service.version", value: { stringValue: this.serviceVersion } },
          { key: "service.namespace", value: { stringValue: "deno-web-app" } },
          { key: "span.name", value: { stringValue: spanName } }
        ];

        const customAttributes = spanData._attributes ? Object.entries(spanData._attributes).map(([key, value]) => ({
          key,
          value: { stringValue: value?.toString() || "" }
        })) : [];

        return {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
          parentSpanId: parentSpanId || undefined,
          name: spanName,
          kind: parentSpanId ? 3 : 2, // INTERNAL(3) 或 SERVER(2)
          startTimeUnixNano: Math.floor(startTime * 1000000),
          endTimeUnixNano: Math.floor(endTime * 1000000),
          attributes: [...baseAttributes, ...customAttributes],
          status: {
            code: spanData._status?.code === SpanStatusCode.ERROR ? 2 : 1,
            message: spanData._status?.code === SpanStatusCode.ERROR ? "Error" : "OK"
          },
          // 添加 flags 確保 trace 被正確識別
          flags: 1
        };
      });

      const payload = {
        resourceSpans: [{
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              { key: "service.version", value: { stringValue: this.serviceVersion } },
              { key: "service.namespace", value: { stringValue: "deno-web-app" } },
              // 添加時間戳確保數據新鮮度
              { key: "export.timestamp", value: { stringValue: new Date().toISOString() } }
            ]
          },
          scopeSpans: [{
            scope: {
              name: "deno-web-app-tracer",
              version: "1.0.0"
            },
            spans: otlpSpans
          }]
        }]
      };

      // 嘗試多個端點
      const endpoints = [
        `http://${this.collectorEndpoint}/v1/traces`,
        `http://otel-collector.deno-web-app.svc.cluster.local:4318/v1/traces`
      ];

      let sent = false;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000)
          });

          if (response.ok) {
            console.log(`[${new Date().toISOString()}] [INFO] [tracing] 成功發送 ${otlpSpans.length} 個 spans 到 ${endpoint}`);
            sent = true;
            break;
          }
        } catch (endpointError) {
          console.warn(`[${new Date().toISOString()}] [WARN] [tracing] ${endpoint} 連接失敗:`, endpointError);
          continue;
        }
      }

      if (!sent) {
        console.error(`[${new Date().toISOString()}] [ERROR] [tracing] 所有端點都無法發送 ${otlpSpans.length} 個 spans`);
      }

    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ERROR] [tracing] 無法發送 trace 數據:`, error);
    }
  }
}

// 初始化 OpenTelemetry
const serviceName = "deno-web-app";
const serviceVersion = "1.0.0";
const collectorEndpoint = Deno.env.get("OTEL_COLLECTOR_ENDPOINT") || "otel-collector:4318";

const exporter = new DenoOTLPExporter(serviceName, serviceVersion, collectorEndpoint);

// 創建 tracer
const tracer = trace.getTracer(serviceName, serviceVersion);

console.log(`[${new Date().toISOString()}] [INFO] [tracing] OpenTelemetry 初始化完成`);

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

// OpenTelemetry 追蹤和指標收集中間件
app.use(async (ctx: Context, next: Next) => {
  const startTime = Date.now();
  const method = ctx.request.method;
  const path = ctx.request.url.pathname;
  const spanName = `${method} ${path}`;
  
  // 創建 HTTP 請求 span
  const span = tracer.startSpan(spanName, {
    kind: 2,
    attributes: {
      "http.method": method,
      "http.url": ctx.request.url.toString(),
      "http.route": path,
      "http.user_agent": ctx.request.headers.get("user-agent") || "",
      "service.name": serviceName,
      "service.version": serviceVersion,
    },
  });
  
  metricsCollector.incrementConnection();
  
  try {
    // 將 span 存儲在 context 中，供其他中間件使用
    ctx.state.span = span;
    ctx.state.spanName = spanName;
    ctx.state.spanStartTime = startTime;
    
    await next();
    
    // 設置 span 狀態為成功
    const status = ctx.response.status || 200;
    span.setAttributes({
      "http.status_code": status,
      "http.response.size": parseInt(ctx.response.headers.get("content-length") || "0"),
    });
    
    if (status >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${status}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    
  } catch (error) {
    // 記錄錯誤到 span
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const status = ctx.response.status?.toString() || "200";
    
    // 記錄請求持續時間
    span.setAttributes({
      "http.request.duration_ms": duration,
    });
    
    // 結束 span 並導出
    span.end();
    // HTTP 請求 span 是 root span，不設置 parentSpanId
    await exporter.exportSpan(span, spanName, startTime, endTime);
    
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
    const jwtStartTime = Date.now();
    const jwtSpanName = "JWT Verification";
    const jwtSpan = tracer.startSpan(jwtSpanName, {
      attributes: {
        "auth.method": "jwt",
        "auth.token_present": true,
      },
    });
    
    const jwt = auth.replace("Bearer ", "");
    try {
      const { payload } = await jwtVerify(jwt, JWT_SECRET, { algorithms: ["HS256"] });
      ctx.state.user = payload;
      
      jwtSpan.setAttributes({
        "auth.success": true,
        "auth.user_id": String(payload.sub || payload.userId || "unknown"),
      });
      jwtSpan.setStatus({ code: SpanStatusCode.OK });
      
    } catch (e) {
      jwtSpan.setAttributes({
        "auth.success": false,
        "auth.error": e instanceof Error ? e.message : "Unknown error",
      });
      jwtSpan.recordException(e as Error);
      jwtSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: "JWT verification failed",
      });
      console.error(`[${new Date().toISOString()}] [ERROR] [JWT] 驗證失敗:`, e);
    } finally {
      const jwtEndTime = Date.now();
      jwtSpan.end();
      await exporter.exportSpan(jwtSpan, jwtSpanName, jwtStartTime, jwtEndTime, parentSpan.spanContext().spanId);
    }
  } else {
    // 記錄無認證令牌的情況
    parentSpan.setAttributes({
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