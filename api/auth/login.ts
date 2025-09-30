import { Router } from "https://deno.land/x/oak@v17.1.6/mod.ts";
import { Client } from "https://deno.land/x/mysql/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { SignJWT } from "https://deno.land/x/jose@v5.3.0/jwt/sign.ts";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

const dbConfig = {
  hostname: Deno.env.get("DB_HOST") ?? "",
  username: Deno.env.get("DB_USER") ?? "",
  password: Deno.env.get("DB_PASS") ?? "",
  db: Deno.env.get("DB_NAME") ?? "",
  debug: false,
};

const client = await new Client().connect(dbConfig);

// 創建路由處理註冊請求
export const loginRouter = new Router();
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) {
  throw new Error("JWT_SECRET 未設定");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

loginRouter.post("/api/auth/login", async (ctx) => {
  const tracer = trace.getTracer("deno-web-app");
  
  return tracer.startActiveSpan("auth.login", async (span) => {
    try {
      span.setAttributes({
        "http.method": "POST",
        "http.route": "/api/auth/login",
        "operation.name": "user_login"
      });

      if (ctx.request.hasBody) {
        const { email, password } = ctx.state.body;
        
        span.setAttribute("user.email", email);
        
        const users = await client.query(
          `SELECT * FROM users WHERE email = ?`,
          [email]
        );

        if (users.length === 0) {
          span.setAttributes({
            "auth.result": "user_not_found",
            "auth.success": false
          });
          ctx.response.status = 401;
          ctx.response.body = { success: false, message: "用戶名或密碼錯誤" };
          return;
        }

        const user = users[0];
        span.setAttribute("user.id", user.id);
        
        const validPassword = await bcrypt.compare(password, user.password);
        console.log(`[${new Date().toISOString()}] [INFO] [login.ts] Password validation result:`, validPassword);

        if (!validPassword) {
          span.setAttributes({
            "auth.result": "invalid_password",
            "auth.success": false
          });
          ctx.response.status = 401;
          ctx.response.body = { success: false, message: "用戶名或密碼錯誤" };
          return;
        }

        // 使用 Jose 產生 JWT
        const jwt = await new SignJWT({
          id: user.id,
          email: user.email,
        })
          .setProtectedHeader({ alg: "HS256", typ: "JWT" })
          .setExpirationTime("1d")
          .sign(JWT_SECRET);

        span.setAttributes({
          "auth.result": "success",
          "auth.success": true,
          "jwt.generated": true
        });

        ctx.response.body = { success: true, id: user.id, token: jwt };
      } else {
        span.setAttribute("auth.result", "missing_body");
        ctx.response.status = 400;
        ctx.response.body = { success: false, message: "缺少請求資料" };
      }
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      ctx.response.status = 500;
      ctx.response.body = { success: false, message: "伺服器錯誤", error: error instanceof Error ? error.message : String(error) };
    } finally {
      span.end();
    }
  });
});