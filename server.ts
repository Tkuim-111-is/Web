import { Application, Router, send, Context, Next, RouteParams } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { registerRouter } from "./api/auth/register.ts";
import { loginRouter } from "./api/auth/login.ts";
import { learnStatusRouter } from "./api/profile/learn_status.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { jwtVerify } from "https://deno.land/x/jose@v5.3.0/jwt/verify.ts";

const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) throw new Error("JWT_SECRET 未設定");
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const app = new Application();
const router = new Router();

// ==========================
// 中間件區塊
// ==========================

// 解析 JSON 主體
app.use(async (ctx: Context, next: Next) => {
  if (ctx.request.hasBody) {
    try {
      const body = await ctx.request.body.json();
      ctx.state.body = body;
    } catch (error: unknown) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "無效的 JSON 格式", error: error instanceof Error ? error.message : "未知錯誤" };
      console.error(`[${new Date().toISOString()}] [ERROR] [server.ts] Invalid JSON Format ${ctx.request.url.pathname}`);
      return;
    }
  }
  await next();
});

// JWT 驗證：將驗證結果存入 ctx.state.user
app.use(async (ctx: Context, next: Next) => {
  const auth = ctx.request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const jwt = auth.replace("Bearer ", "");
    try {
      const { payload } = await jwtVerify(jwt, JWT_SECRET, { algorithms: ["HS256"] });
      ctx.state.user = payload;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] [ERROR] [JWT] 驗證失敗:`, e);
    }
  }
  await next();
});

app.use(async (ctx: Context, next: Next) => {
  const filePath = ctx.request.url.pathname;
  if (filePath.startsWith("/favicon") || filePath === "/favicon.ico" || filePath === "/site.webmanifest") {
    await send(ctx, filePath, {
      root: `${Deno.cwd()}/public`,
    });
    return;
  }
  await next();
});

// 靜態檔案服務：處理 /static 路徑
app.use(async (ctx: Context, next: Next) => {
  try {
    const path = ctx.request.url.pathname;
    if (path.startsWith("/static")) {
      await send(ctx, path, {
        root: `${Deno.cwd()}`,
      });
      return;
    }
    await next();
  } catch {
    await next();
  }
});

// ==========================
// API 路由（不需 JWT）
// ==========================
app.use(registerRouter.routes());
app.use(registerRouter.allowedMethods());

app.use(loginRouter.routes());
app.use(loginRouter.allowedMethods());

app.use(learnStatusRouter.routes());
app.use(learnStatusRouter.allowedMethods());

// ==========================
// 登出導回首頁
// ==========================
router.get("/logout", (ctx: Context) => {
  // 清除客戶端的 token 通過重定向到首頁
  ctx.response.redirect("/index.html");
});

// ==========================
// 路由保護：/profile/*.html 頁面
// ==========================
router.get("/api/:apiName", async (ctx: Context, next: Next) => {
  // JWT 驗證
  if (!ctx.state.user) {
    ctx.response.status = 401;
    ctx.response.body = { success: false, message: "未登入" };
    return;
  }
  await next();
});

// 靜態頁面不驗證 JWT
router.get("/profile/:page", async (ctx: Context<any>) => {
  const requestedPage = ctx.params.page;
  const filePath = `/profile/${requestedPage}`;
  try {
    await send(ctx, filePath, {
      root: `${Deno.cwd()}`,
    });
  } catch {
    ctx.response.status = 404;
    ctx.response.body = "頁面不存在";
    console.error(`[${new Date().toISOString()}] [ERROR] [server.ts] 404 Not Found for ${ctx.request.url.pathname}`);
  }
});

// ==========================
// 一般 HTML 頁面處理
// ==========================
router.get("/(.*)", async (ctx: Context) => {
  try {
    const path = ctx.request.url.pathname;
    let filePath = path;
    if (path === "/" || path === "") {
      filePath = "/index.html";
    }

    await send(ctx, filePath, {
      root: `${Deno.cwd()}/views`,
      index: "index.html",
    });
  } catch (_error) {
    ctx.response.status = 404;
    ctx.response.body = "頁面不存在";
    console.error(`[${new Date().toISOString()}] [ERROR] [server.ts] 404 Not Found for ${ctx.request.url.pathname}`);
  }
});

// ==========================
// 啟動服務
// ==========================
app.use(router.routes());
app.use(router.allowedMethods());
const port = parseInt(Deno.env.get("PORT") ?? "");
const host = String(Deno.env.get("HOST") ?? "");
console.log(`[${new Date().toISOString()}] [INFO] [server.ts] Server is running at http://localhost:${port}`);
await app.listen({ port, hostname: host });