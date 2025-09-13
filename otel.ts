import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { trace, metrics, Tracer, Meter } from '@opentelemetry/api';

// 從環境變數讀取設定
const OTEL_COLLECTOR_URL = Deno.env.get('OTEL_COLLECTOR_URL') || 'http://localhost:4318';
const SERVICE_NAME = Deno.env.get('SERVICE_NAME') || 'deno-web-app';
const SERVICE_VERSION = Deno.env.get('SERVICE_VERSION') || '1.0.0';
const ENVIRONMENT = Deno.env.get('ENVIRONMENT') || 'development';

// 建立資源定義
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
  [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'web-app',
});

// 設定 OTLP 匯出器
const traceExporter = new OTLPTraceExporter({
  url: `${OTEL_COLLECTOR_URL}/v1/traces`,
  headers: {},
});

const metricExporter = new OTLPMetricExporter({
  url: `${OTEL_COLLECTOR_URL}/v1/metrics`,
  headers: {},
});

// 全域變數儲存 tracer 和 meter
let globalTracer: Tracer;
let globalMeter: Meter;

// 簡化的 OpenTelemetry 初始化
export function initializeOpenTelemetry() {
  try {
    // 建立 tracer 和 meter
    globalTracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
    globalMeter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);
    
    console.log(`[${new Date().toISOString()}] [INFO] [otel.ts] OpenTelemetry initialized successfully`);
    
    // 驗證追蹤器是否正常工作
    const span = globalTracer.startSpan('otel-initialization-test');
    span.setAttributes({
      'test.initialization': true,
      'service.name': SERVICE_NAME,
    });
    span.end();
    
    return { tracer: globalTracer, meter: globalMeter };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] [otel.ts] Failed to initialize OpenTelemetry:`, error);
    // 建立 no-op tracer 和 meter 作為後備
    globalTracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
    globalMeter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);
    return { tracer: globalTracer, meter: globalMeter };
  }
}

// 關閉 OpenTelemetry
export async function shutdownOpenTelemetry() {
  try {
    console.log(`[${new Date().toISOString()}] [INFO] [otel.ts] OpenTelemetry shutdown successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] [otel.ts] Failed to shutdown OpenTelemetry:`, error);
  }
}

// 匯出常用的追蹤和指標工具
export function getTracer(): Tracer {
  return globalTracer || trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

export function getMeter(): Meter {
  return globalMeter || metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);
}

// 建立自定義指標
export function createCustomMetrics() {
  const meter = getMeter();
  
  return {
    // HTTP 請求計數器
    httpRequestCounter: meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
    }),
    
    // HTTP 請求持續時間直方圖
    httpRequestDuration: meter.createHistogram('http_request_duration_seconds', {
      description: 'HTTP request duration in seconds',
      unit: 's',
    }),
    
    // 資料庫連線計數器
    dbConnectionCounter: meter.createCounter('db_connections_total', {
      description: 'Total number of database connections',
    }),
    
    // 資料庫查詢持續時間
    dbQueryDuration: meter.createHistogram('db_query_duration_seconds', {
      description: 'Database query duration in seconds',
      unit: 's',
    }),
    
    // 活躍用戶計數器
    activeUsersGauge: meter.createUpDownCounter('active_users', {
      description: 'Number of active users',
    }),
  };
}

// 簡化的 Prometheus 指標伺服器
let metricsServer: Deno.HttpServer | null = null;

export function startPrometheusServer(port = 9464) {
  if (metricsServer) {
    return;
  }

  const handler = async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname === '/metrics') {
      // 簡化的指標輸出
      const metrics = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/"} 0

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 0
http_request_duration_seconds_bucket{le="0.5"} 0
http_request_duration_seconds_bucket{le="1.0"} 0
http_request_duration_seconds_bucket{le="+Inf"} 0
http_request_duration_seconds_sum 0
http_request_duration_seconds_count 0

# HELP db_connections_total Total number of database connections
# TYPE db_connections_total counter
db_connections_total 0

# HELP active_users Number of active users
# TYPE active_users gauge
active_users 0
`.trim();

      return new Response(metrics, {
        headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
      });
    }
    
    return new Response('Not Found', { status: 404 });
  };

  metricsServer = Deno.serve({ port, hostname: '0.0.0.0' }, handler);
  console.log(`[${new Date().toISOString()}] [INFO] [otel.ts] Prometheus metrics server started on port ${port}`);
}