import { Router } from "https://deno.land/x/oak/mod.ts";
// JWT 功能保留以備未來使用（如 token 刷新、自定義驗證等）
import { create as _create, verify as _verify, getNumericDate as _getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createTracedClient, createBusinessTracer } from "../../utils/db-tracer.ts";

// 讀取資料庫設定
const dbConfig = {
  hostname: Deno.env.get("DB_HOST") ?? "",
  username: Deno.env.get("DB_USER") ?? "",
  password: Deno.env.get("DB_PASS") ?? "",
  db: Deno.env.get("DB_NAME") ?? "",
};

const client = createTracedClient();
await client.connect(dbConfig);

const businessTracer = createBusinessTracer();

export const learnStatusRouter = new Router();
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) {
  throw new Error("JWT_SECRET 未設定");
}
const _JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// 新增學習歷程
learnStatusRouter.post("/api/profile/learn_status", async (ctx) => {
  try {
    if (ctx.request.hasBody) {
      const { user_email, context_id, err_count, time_record } = ctx.state.body;
      if (!user_email || !context_id || err_count === undefined || time_record === undefined) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, message: "缺少必要欄位" };
        return;
      }
      
      // 使用業務追蹤器包裝學習狀態記錄邏輯
      await businessTracer.traceOperation('learn_status.create', {
        user_email,
        context_id: context_id.toString(),
        err_count: err_count.toString(),
        time_record: time_record.toString(),
      }, async () => {
        await client.execute(
          "INSERT INTO learn_status (user_email, context_id, err_count, time_record) VALUES (?, ?, ?, ?)",
          [user_email, context_id, err_count, time_record]
        );
      });
      
      ctx.response.body = { success: true };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "沒有提供請求數據" };
    }
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'Learn status creation failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: ctx.state.requestId,
    }));
    ctx.response.status = 500;
    ctx.response.body = { success: false, message: "伺服器錯誤", error: error instanceof Error ? error.message : "未知錯誤" };
  }
});

// 查詢學習歷程
learnStatusRouter.get("/api/profile/learn_status", async (ctx) => {
  const user = ctx.state.user;
  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = { success: false, message: "未登入" };
    return;
  }
  
  try {
    // 使用業務追蹤器包裝學習狀態查詢邏輯
    const rows = await businessTracer.traceOperation('learn_status.query', {
      user_email: user.email,
    }, async () => {
      return await client.query(
        "SELECT context_id, err_count, time_record, created_at FROM learn_status WHERE user_email = ? ORDER BY context_id",
        [user.email]
      );
    });
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Learn status query completed',
      user_email: user.email,
      rowCount: rows.length,
      requestId: ctx.state.requestId,
    }));
    
    ctx.response.body = { success: true, data: rows };
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'Learn status query failed',
      user_email: user.email,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: ctx.state.requestId,
    }));
    
    ctx.response.status = 500;
    ctx.response.body = { success: false, message: "查詢失敗" };
  }
});