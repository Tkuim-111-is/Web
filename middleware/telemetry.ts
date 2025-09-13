import { Context, Middleware } from "https://deno.land/x/oak/mod.ts";
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { getTracer, createCustomMetrics } from '../otel.ts';

// 建立自定義指標
const metrics = createCustomMetrics();

// OpenTelemetry 追蹤中間件
export const telemetryMiddleware: Middleware = async (ctx: Context, next) => {
  const tracer = getTracer();
  const startTime = Date.now();
  
  // 建立 span 名稱
  const spanName = `${ctx.request.method} ${ctx.request.url.pathname}`;
  
  // 開始新的 span
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': ctx.request.method,
      'http.url': ctx.request.url.toString(),
      'http.scheme': ctx.request.url.protocol.replace(':', ''),
      'http.host': ctx.request.url.host,
      'http.target': ctx.request.url.pathname + ctx.request.url.search,
      'http.user_agent': ctx.request.headers.get('user-agent') || '',
      'http.route': ctx.request.url.pathname,
    },
  });

  // 增加 HTTP 請求計數器
  metrics.httpRequestCounter.add(1, {
    method: ctx.request.method,
    route: ctx.request.url.pathname,
  });

  try {
    // 在 span 上下文中執行下一個中間件
    await context.with(trace.setSpan(context.active(), span), async () => {
      await next();
    });

    // 設定回應狀態碼
    span.setAttributes({
      'http.status_code': ctx.response.status || 200,
      'http.response.status_code': ctx.response.status || 200,
    });

    // 根據狀態碼設定 span 狀態
    if (ctx.response.status && ctx.response.status >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${ctx.response.status}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

  } catch (error) {
    // 記錄錯誤
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // 重新拋出錯誤
    throw error;
  } finally {
    // 計算請求持續時間
    const duration = (Date.now() - startTime) / 1000;
    
    // 記錄請求持續時間
    metrics.httpRequestDuration.record(duration, {
      method: ctx.request.method,
      route: ctx.request.url.pathname,
      status_code: (ctx.response.status || 200).toString(),
    });
    
    // 結束 span
    span.end();
  }
};

// 錯誤處理中間件
export const errorHandlingMiddleware: Middleware = async (ctx: Context, next) => {
  try {
    await next();
  } catch (error) {
    const tracer = getTracer();
    const span = trace.getActiveSpan();
    
    if (span) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 記錄錯誤到控制台
    console.error(`[${new Date().toISOString()}] [ERROR] [telemetry.ts] Request error:`, {
      method: ctx.request.method,
      url: ctx.request.url.toString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // 設定錯誤回應
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: '伺服器內部錯誤',
      timestamp: new Date().toISOString(),
    };
  }
};

// 記錄中間件 - 結構化日誌
export const loggingMiddleware: Middleware = async (ctx: Context, next) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // 在 context 中設定請求 ID
  ctx.state.requestId = requestId;
  
  // 記錄請求開始
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: 'Request started',
    requestId,
    method: ctx.request.method,
    url: ctx.request.url.toString(),
    userAgent: ctx.request.headers.get('user-agent') || '',
    ip: ctx.request.ip,
  }));

  try {
    await next();
    
    const duration = Date.now() - startTime;
    
    // 記錄請求完成
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Request completed',
      requestId,
      method: ctx.request.method,
      url: ctx.request.url.toString(),
      statusCode: ctx.response.status || 200,
      duration: `${duration}ms`,
    }));
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // 記錄請求錯誤
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'Request failed',
      requestId,
      method: ctx.request.method,
      url: ctx.request.url.toString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
    }));
    
    throw error;
  }
};

// JWT 驗證追蹤中間件
export const jwtTracingMiddleware: Middleware = async (ctx: Context, next) => {
  const tracer = getTracer();
  const span = tracer.startSpan('jwt.verification', {
    attributes: {
      'auth.method': 'jwt',
      'http.route': ctx.request.url.pathname,
    },
  });

  try {
    await context.with(trace.setSpan(context.active(), span), async () => {
      await next();
    });

    // 記錄驗證結果
    if (ctx.state.user) {
      span.setAttributes({
        'auth.user.id': ctx.state.user.id,
        'auth.user.email': ctx.state.user.email,
        'auth.success': true,
      });
      
      // 更新活躍用戶指標
      metrics.activeUsersGauge.add(1, {
        user_id: ctx.state.user.id.toString(),
      });
    } else {
      span.setAttributes({
        'auth.success': false,
      });
    }

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'JWT verification failed',
    });
    throw error;
  } finally {
    span.end();
  }
};
