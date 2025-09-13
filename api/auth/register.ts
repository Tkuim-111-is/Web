import { Router } from "https://deno.land/x/oak/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createTracedClient, createBusinessTracer } from "../../utils/db-tracer.ts";

// 讀取資料庫設定
const dbConfig = {
  hostname: Deno.env.get("DB_HOST") ?? "localhost",
  username: Deno.env.get("DB_USER") ?? "root",
  password: Deno.env.get("DB_PASS") ?? "",
  db: Deno.env.get("DB_NAME") ?? "test_db",
};

const client = createTracedClient();
await client.connect(dbConfig);

const businessTracer = createBusinessTracer();

// 創建路由處理註冊請求
export const registerRouter = new Router();
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) {
  throw new Error("JWT_SECRET 未設定");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

registerRouter.post("/api/auth/register", async (ctx) => {
  try {
    // 獲取請求體 - 修正獲取方式
    if (ctx.request.hasBody) {
      const result = ctx.state.body;
      const {email, password } = result ;
      // 驗證必須的欄位
      if (!email || !password) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, message: "缺少必要信息" };
        return;
      }

      // 使用業務追蹤器包裝註冊邏輯
      await businessTracer.traceUserRegistration(email, async () => {
        // 檢查郵箱是否已註冊
        const existingUser = await client.query(
          `SELECT * FROM users WHERE email = ?`,
          [email]
        );

        if (existingUser.length > 0) {
          ctx.response.status = 400;
          ctx.response.body = { success: false, message: "此電子郵件已被註冊" };
          return;
        }

        // 對密碼進行加密
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 將用戶資料插入資料庫
        await client.execute(
          `INSERT INTO users (email, password) 
           values (?, ?)`,
          [email, hashedPassword]
        );

        ctx.response.body = { success: true };
      });
    } else {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "沒有提供請求數據" };
    }
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'User registration failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: ctx.state.requestId,
    }));
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false, 
      message: "服務器錯誤，請稍後再試" 
    };
  }
});