import { Router } from "https://deno.land/x/oak/mod.ts";
import { getTracer, getMeter } from "../otel.ts";
import { createTracedClient } from "../utils/db-tracer.ts";

export const healthRouter = new Router();

// 健康檢查端點
healthRouter.get("/health", async (ctx) => {
  const tracer = getTracer();
  const span = tracer.startSpan('health.check');
  
  try {
    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: {
        name: Deno.env.get("SERVICE_NAME") || "deno-web-app",
        version: Deno.env.get("SERVICE_VERSION") || "1.0.0",
        environment: Deno.env.get("ENVIRONMENT") || "development",
      },
      checks: {
        database: "unknown",
        opentelemetry: "unknown",
      },
    };

    // 檢查資料庫連線
    try {
      const dbConfig = {
        hostname: Deno.env.get("DB_HOST") ?? "localhost",
        username: Deno.env.get("DB_USER") ?? "root",
        password: Deno.env.get("DB_PASS") ?? "",
        db: Deno.env.get("DB_NAME") ?? "test_db",
      };
      
      const client = createTracedClient();
      await client.connect(dbConfig);
      await client.query("SELECT 1");
      await client.close();
      
      healthStatus.checks.database = "healthy";
    } catch (error) {
      healthStatus.checks.database = "unhealthy";
      healthStatus.status = "degraded";
      
      span.recordException(error as Error);
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Database health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }

    // 檢查 OpenTelemetry
    try {
      const meter = getMeter();
      const healthCounter = meter.createCounter('health_check_total', {
        description: 'Total number of health checks',
      });
      healthCounter.add(1, { status: healthStatus.status });
      
      healthStatus.checks.opentelemetry = "healthy";
    } catch (error) {
      healthStatus.checks.opentelemetry = "unhealthy";
      healthStatus.status = "degraded";
      
      span.recordException(error as Error);
    }

    // 設定回應狀態碼
    if (healthStatus.status === "healthy") {
      ctx.response.status = 200;
    } else {
      ctx.response.status = 503;
    }

    span.setAttributes({
      'health.status': healthStatus.status,
      'health.database': healthStatus.checks.database,
      'health.opentelemetry': healthStatus.checks.opentelemetry,
    });

    ctx.response.body = healthStatus;
  } catch (error) {
    span.recordException(error as Error);
    
    ctx.response.status = 500;
    ctx.response.body = {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    span.end();
  }
});

// 就緒檢查端點
healthRouter.get("/ready", async (ctx) => {
  const tracer = getTracer();
  const span = tracer.startSpan('readiness.check');
  
  try {
    // 檢查所有必要服務是否就緒
    const readinessStatus = {
      status: "ready",
      timestamp: new Date().toISOString(),
      checks: {
        database: false,
        environment: false,
      },
    };

    // 檢查環境變數
    const requiredEnvVars = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_NAME"];
    const missingEnvVars = requiredEnvVars.filter(envVar => !Deno.env.get(envVar));
    
    if (missingEnvVars.length === 0) {
      readinessStatus.checks.environment = true;
    } else {
      readinessStatus.status = "not_ready";
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Missing required environment variables',
        missingEnvVars,
      }));
    }

    // 檢查資料庫連線
    try {
      const dbConfig = {
        hostname: Deno.env.get("DB_HOST") ?? "localhost",
        username: Deno.env.get("DB_USER") ?? "root",
        password: Deno.env.get("DB_PASS") ?? "",
        db: Deno.env.get("DB_NAME") ?? "test_db",
      };
      
      const client = createTracedClient();
      await client.connect(dbConfig);
      await client.query("SELECT 1");
      await client.close();
      
      readinessStatus.checks.database = true;
    } catch (error) {
      readinessStatus.status = "not_ready";
      span.recordException(error as Error);
    }

    // 設定回應狀態碼
    if (readinessStatus.status === "ready") {
      ctx.response.status = 200;
    } else {
      ctx.response.status = 503;
    }

    span.setAttributes({
      'readiness.status': readinessStatus.status,
      'readiness.database': readinessStatus.checks.database,
      'readiness.environment': readinessStatus.checks.environment,
    });

    ctx.response.body = readinessStatus;
  } catch (error) {
    span.recordException(error as Error);
    
    ctx.response.status = 500;
    ctx.response.body = {
      status: "error",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    span.end();
  }
});

// 存活檢查端點（輕量級）
healthRouter.get("/live", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = {
    status: "alive",
    timestamp: new Date().toISOString(),
  };
});

// Prometheus metrics 端點
healthRouter.get("/metrics", async (ctx) => {
  try {
    // 從內建的 Prometheus 伺服器獲取指標
    const response = await fetch("http://localhost:9464/metrics");
    if (!response.ok) {
      throw new Error(`Metrics server responded with ${response.status}`);
    }
    const metrics = await response.text();
    
    ctx.response.headers.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    ctx.response.body = metrics;
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'Failed to fetch metrics',
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    
    // 提供基本的指標作為後備
    const basicMetrics = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health"} 1

# HELP service_info Service information
# TYPE service_info gauge
service_info{service="${Deno.env.get("SERVICE_NAME") || "deno-web-app"}",version="${Deno.env.get("SERVICE_VERSION") || "1.0.0"}"} 1
`.trim();
    
    ctx.response.headers.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    ctx.response.body = basicMetrics;
  }
});
