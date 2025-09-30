import { Router } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { Client } from "https://deno.land/x/mysql/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

// 讀取資料庫設定
const dbConfig = {
  hostname: Deno.env.get("DB_HOST") ?? "",
  username: Deno.env.get("DB_USER") ?? "",
  password: Deno.env.get("DB_PASS") ?? "",
  db: Deno.env.get("DB_NAME") ?? "",
  debug: false,
};

const client = await new Client().connect(dbConfig);

// 創建路由處理註冊請求
export const registerRouter = new Router();

registerRouter.post("/api/auth/register", async (ctx) => {
  const tracer = trace.getTracer("deno-web-app");
  
  return tracer.startActiveSpan("auth.register", async (span) => {
    try {
      span.setAttributes({
        "http.method": "POST",
        "http.route": "/api/auth/register",
        "operation.name": "user_register"
      });

      // 獲取請求體 - 修正獲取方式
      if (ctx.request.hasBody) {
        const result = ctx.state.body;
        const {email, password } = result ;
        
        span.setAttribute("user.email", email);
        
        // 驗證必須的欄位
        if (!email || !password) {
          span.setAttributes({
            "register.result": "missing_fields",
            "register.success": false
          });
          ctx.response.status = 400;
          ctx.response.body = { success: false, message: "缺少必要信息" };
          return;
        }

        // 檢查郵箱是否已註冊
        const existingUser = await client.query(
          `SELECT * FROM users WHERE email = ?`,
          [email]
        );

        if (existingUser.length > 0) {
          span.setAttributes({
            "register.result": "email_exists",
            "register.success": false
          });
          ctx.response.status = 400;
          ctx.response.body = { success: false, message: "此電子郵件已被註冊" };
          return;
        }

        // 對密碼進行加密
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 將用戶資料插入資料庫
        const insertResult = await client.execute(
          `INSERT INTO users (email, password) 
           values (?, ?)`,
          [email, hashedPassword]
        );

        const userId = insertResult.lastInsertId;
        
        span.setAttributes({
          "register.result": "success",
          "register.success": true,
          "user.id": userId
        });
        
        ctx.response.body = { success: true, id: userId };
      } else {
        span.setAttribute("register.result", "missing_body");
        ctx.response.status = 400;
        ctx.response.body = { success: false, message: "沒有提供請求數據" };
      }
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      console.error("註冊錯誤:", error);
      ctx.response.status = 500;
      ctx.response.body = { 
        success: false, 
        message: "服務器錯誤，請稍後再試" 
      };
    } finally {
      span.end();
    }
  });
});