import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { trace, metrics, logs } from '@opentelemetry/api';

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

const logExporter = new OTLPLogExporter({
  url: `${OTEL_COLLECTOR_URL}/v1/logs`,
  headers: {},
});

// 設定 Prometheus 匯出器
const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: '/metrics',
}, () => {
  console.log(`[${new Date().toISOString()}] [INFO] [otel.ts] Prometheus metrics server started on port 9464`);
});

// 建立 SDK 實例
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: prometheusExporter,
  logRecordProcessor: undefined, // 將使用預設的批次處理器
  instrumentations: [
    getNodeAutoInstrumentations({
      // 停用不需要的儀器
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
    new HttpInstrumentation({
      // HTTP 請求追蹤設定
      requestHook: (span, request) => {
        span.setAttributes({
          'http.request.header.user-agent': request.headers['user-agent'] || '',
          'http.request.header.content-type': request.headers['content-type'] || '',
        });
      },
      responseHook: (span, response) => {
        span.setAttributes({
          'http.response.header.content-type': response.headers['content-type'] || '',
        });
      },
    }),
  ],
});

// 初始化 OpenTelemetry
export function initializeOpenTelemetry() {
  try {
    sdk.start();
    console.log(`[${new Date().toISOString()}] [INFO] [otel.ts] OpenTelemetry initialized successfully`);
    
    // 驗證追蹤器是否正常工作
    const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
    const span = tracer.startSpan('otel-initialization-test');
    span.setAttributes({
      'test.initialization': true,
      'service.name': SERVICE_NAME,
    });
    span.end();
    
    return { tracer, meter: metrics.getMeter(SERVICE_NAME, SERVICE_VERSION) };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] [otel.ts] Failed to initialize OpenTelemetry:`, error);
    throw error;
  }
}

// 關閉 OpenTelemetry
export async function shutdownOpenTelemetry() {
  try {
    await sdk.shutdown();
    console.log(`[${new Date().toISOString()}] [INFO] [otel.ts] OpenTelemetry shutdown successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] [otel.ts] Failed to shutdown OpenTelemetry:`, error);
  }
}

// 匯出常用的追蹤和指標工具
export function getTracer() {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

export function getMeter() {
  return metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);
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
