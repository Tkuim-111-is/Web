import { Router } from "https://deno.land/x/oak/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { SignJWT } from "https://deno.land/x/jose@v5.3.0/jwt/sign.ts";
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

// export const sessions = new Map();

// 創建路由處理註冊請求
export const loginRouter = new Router();
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) {
  throw new Error("JWT_SECRET 未設定");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW); // 這一行很重要！

loginRouter.post("/api/auth/login", async (ctx) => {
  try {
    if (ctx.request.hasBody) {
      const { email, password } = ctx.state.body;
      
      // 使用業務追蹤器包裝登入邏輯
      await businessTracer.traceUserLogin(email, async () => {
        const users = await client.query(
          `SELECT * FROM users WHERE email = ?`,
          [email]
        );

        if (users.length === 0) {
          ctx.response.status = 401;
          ctx.response.body = { success: false, message: "用戶名或密碼錯誤" };
          return;
        }

        const user = users[0] as { id: number; email: string; password: string };
        const validPassword = await bcrypt.compare(password, user.password);

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: 'Password validation result',
          email,
          validPassword,
          requestId: ctx.state.requestId,
        }));

        if (!validPassword) {
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

        ctx.response.body = { success: true, token: jwt };
      });
    } else {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "缺少請求資料" };
    }
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'User login failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: ctx.state.requestId,
    }));
    ctx.response.status = 500;
    ctx.response.body = { success: false, message: "伺服器錯誤", error: error instanceof Error ? error.message : 'Unknown error' };
  }
});
