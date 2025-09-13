import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { Client } from "https://deno.land/x/mysql/mod.ts";
import { getTracer, createCustomMetrics } from '../otel.ts';

// 建立自定義指標
const metrics = createCustomMetrics();

// 包裝 MySQL 客戶端以加入追蹤功能
export class TracedMySQLClient {
  private client: Client;
  private tracer = getTracer();

  constructor(client: Client) {
    this.client = client;
  }

  // 追蹤 query 方法
  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const startTime = Date.now();
    const span = this.tracer.startSpan('db.query', {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'mysql',
        'db.operation': this.extractOperation(sql),
        'db.statement': sql,
        'db.sql.table': this.extractTable(sql),
      },
    });

    // 增加資料庫連線計數器
    metrics.dbConnectionCounter.add(1, {
      operation: this.extractOperation(sql),
      table: this.extractTable(sql) || 'unknown',
    });

    try {
      const result = await context.with(trace.setSpan(context.active(), span), async () => {
        return await this.client.query(sql, params);
      });

      // 設定成功屬性
      span.setAttributes({
        'db.rows_affected': Array.isArray(result) ? result.length : 0,
      });
      
      span.setStatus({ code: SpanStatusCode.OK });
      return result;

    } catch (error) {
      // 記錄錯誤
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Database query failed',
      });

      // 記錄錯誤日誌
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Database query failed',
        sql,
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));

      throw error;
    } finally {
      // 記錄查詢持續時間
      const duration = (Date.now() - startTime) / 1000;
      metrics.dbQueryDuration.record(duration, {
        operation: this.extractOperation(sql),
        table: this.extractTable(sql) || 'unknown',
      });
      
      span.end();
    }
  }

  // 追蹤 execute 方法
  async execute(sql: string, params?: unknown[]): Promise<unknown> {
    const startTime = Date.now();
    const span = this.tracer.startSpan('db.execute', {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'mysql',
        'db.operation': this.extractOperation(sql),
        'db.statement': sql,
        'db.sql.table': this.extractTable(sql),
      },
    });

    // 增加資料庫連線計數器
    metrics.dbConnectionCounter.add(1, {
      operation: this.extractOperation(sql),
      table: this.extractTable(sql) || 'unknown',
    });

    try {
      const result = await context.with(trace.setSpan(context.active(), span), async () => {
        return await this.client.execute(sql, params);
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;

    } catch (error) {
      // 記錄錯誤
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Database execute failed',
      });

      // 記錄錯誤日誌
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Database execute failed',
        sql,
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));

      throw error;
    } finally {
      // 記錄查詢持續時間
      const duration = (Date.now() - startTime) / 1000;
      metrics.dbQueryDuration.record(duration, {
        operation: this.extractOperation(sql),
        table: this.extractTable(sql) || 'unknown',
      });
      
      span.end();
    }
  }

  // 代理其他方法到原始客戶端
  async connect(config: unknown) {
    const span = this.tracer.startSpan('db.connect', {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'mysql',
        'db.operation': 'connect',
      },
    });

    try {
      const result = await this.client.connect(config);
      span.setStatus({ code: SpanStatusCode.OK });
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Database connected successfully',
      }));
      
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Database connection failed',
      });
      
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Database connection failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
      
      throw error;
    } finally {
      span.end();
    }
  }

  async close() {
    const span = this.tracer.startSpan('db.close', {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'mysql',
        'db.operation': 'close',
      },
    });

    try {
      await this.client.close();
      span.setStatus({ code: SpanStatusCode.OK });
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Database connection closed',
      }));
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Database close failed',
      });
      throw error;
    } finally {
      span.end();
    }
  }

  // 輔助方法：從 SQL 語句中提取操作類型
  private extractOperation(sql: string): string {
    const normalizedSql = sql.trim().toUpperCase();
    if (normalizedSql.startsWith('SELECT')) return 'SELECT';
    if (normalizedSql.startsWith('INSERT')) return 'INSERT';
    if (normalizedSql.startsWith('UPDATE')) return 'UPDATE';
    if (normalizedSql.startsWith('DELETE')) return 'DELETE';
    if (normalizedSql.startsWith('CREATE')) return 'CREATE';
    if (normalizedSql.startsWith('DROP')) return 'DROP';
    if (normalizedSql.startsWith('ALTER')) return 'ALTER';
    return 'OTHER';
  }

  // 輔助方法：從 SQL 語句中提取表名
  private extractTable(sql: string): string | null {
    const normalizedSql = sql.trim().toUpperCase();
    
    // SELECT FROM table
    let match = normalizedSql.match(/FROM\s+(\w+)/);
    if (match) return match[1].toLowerCase();
    
    // INSERT INTO table
    match = normalizedSql.match(/INSERT\s+INTO\s+(\w+)/);
    if (match) return match[1].toLowerCase();
    
    // UPDATE table
    match = normalizedSql.match(/UPDATE\s+(\w+)/);
    if (match) return match[1].toLowerCase();
    
    // DELETE FROM table
    match = normalizedSql.match(/DELETE\s+FROM\s+(\w+)/);
    if (match) return match[1].toLowerCase();
    
    return null;
  }
}

// 建立追蹤的資料庫客戶端工廠函數
export function createTracedClient(): TracedMySQLClient {
  const client = new Client();
  return new TracedMySQLClient(client);
}

// 建立業務邏輯追蹤器
export function createBusinessTracer() {
  const tracer = getTracer();
  
  return {
    // 用戶註冊追蹤
    async traceUserRegistration<T>(email: string, operation: () => Promise<T>): Promise<T> {
      const span = tracer.startSpan('business.user.register', {
        attributes: {
          'user.email': email,
          'business.operation': 'user_registration',
        },
      });

      try {
        const result = await context.with(trace.setSpan(context.active(), span), operation);
        span.setAttributes({
          'business.result': 'success',
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setAttributes({
          'business.result': 'failure',
          'business.error': error instanceof Error ? error.message : 'Unknown error',
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'User registration failed',
        });
        throw error;
      } finally {
        span.end();
      }
    },

    // 用戶登入追蹤
    async traceUserLogin<T>(email: string, operation: () => Promise<T>): Promise<T> {
      const span = tracer.startSpan('business.user.login', {
        attributes: {
          'user.email': email,
          'business.operation': 'user_login',
        },
      });

      try {
        const result = await context.with(trace.setSpan(context.active(), span), operation);
        span.setAttributes({
          'business.result': 'success',
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setAttributes({
          'business.result': 'failure',
          'business.error': error instanceof Error ? error.message : 'Unknown error',
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'User login failed',
        });
        throw error;
      } finally {
        span.end();
      }
    },

    // 一般業務操作追蹤
    async traceOperation<T>(operationName: string, attributes: Record<string, string | number | boolean>, operation: () => Promise<T>): Promise<T> {
      const span = tracer.startSpan(`business.${operationName}`, {
        attributes: {
          ...attributes,
          'business.operation': operationName,
        },
      });

      try {
        const result = await context.with(trace.setSpan(context.active(), span), operation);
        span.setAttributes({
          'business.result': 'success',
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setAttributes({
          'business.result': 'failure',
          'business.error': error instanceof Error ? error.message : 'Unknown error',
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : `${operationName} failed`,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  };
}
