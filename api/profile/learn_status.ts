import { Router } from "https://deno.land/x/oak/mod.ts";
import { Client } from "https://deno.land/x/mysql/mod.ts";
// JWT 功能保留以備未來使用（如 token 刷新、自定義驗證等）
import { create as _create, verify as _verify, getNumericDate as _getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

// 讀取資料庫設定
const dbConfig = {
  hostname: Deno.env.get("DB_HOST") ?? "",
  username: Deno.env.get("DB_USER") ?? "",
  password: Deno.env.get("DB_PASS") ?? "",
  db: Deno.env.get("DB_NAME") ?? "",
};

const client = await new Client().connect(dbConfig);

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
      const { user_id, context_id, err_count, time_record } = ctx.state.body;
      if (!user_id || !context_id || err_count === undefined || time_record === undefined) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, message: "缺少必要欄位" };
        return;
      }
      
      await client.execute(
        "INSERT INTO learn_status (user_id, context_id, err_count, time_record) VALUES (?, ?, ?, ?)",
        [user_id, context_id, err_count, time_record]
      );
      ctx.response.body = { success: true };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "沒有提供請求數據" };
    }
  } catch (error) {
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
  const rows = await client.query(
    "SELECT context_id, err_count, time_record, created_at FROM learn_status WHERE user_email = ? ORDER BY context_id",
    [user.email]
  );
  console.log(`[${new Date().toISOString()}] [INFO] [learn_status.ts] user_email: ${user.email}, rows: ${JSON.stringify(rows)}`);
  ctx.response.body = { success: true, data: rows };
});