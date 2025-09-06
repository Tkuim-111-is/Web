import { Router } from "https://deno.land/x/oak/mod.ts";
import { Client } from "https://deno.land/x/mysql/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { SignJWT } from "https://deno.land/x/jose@v5.3.0/jwt/sign.ts";

// 創建資料庫連接函數
async function createDbConnection() {
  const dbConfig = {
    hostname: Deno.env.get("DB_HOST") ?? "localhost",
    username: Deno.env.get("DB_USER") ?? "root",
    password: Deno.env.get("DB_PASS") ?? "",
    db: Deno.env.get("DB_NAME") ?? "test_db",
  };
  
  return await new Client().connect(dbConfig);
}

// Google OAuth 設定
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI") ?? "http://localhost:8000/api/auth/google/callback";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error("Google OAuth 設定未完成：請設定 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET");
}

export const googleOAuthRouter = new Router();

const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET_RAW) {
  throw new Error("JWT_SECRET 未設定");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// 生成 Google OAuth 授權 URL
googleOAuthRouter.get("/api/auth/google", (ctx) => {
  const state = crypto.randomUUID(); // 生成隨機 state 參數防止 CSRF 攻擊
  
  // 將 state 存儲到 session 或臨時存儲 (這裡簡化處理)
  ctx.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: false, // 在生產環境中應設為 true
    maxAge: 10 * 60 * 1000, // 10 分鐘過期
  });

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);

  ctx.response.redirect(googleAuthUrl.toString());
});

// 處理 Google OAuth 回調
googleOAuthRouter.get("/api/auth/google/callback", async (ctx) => {
  try {
    const url = ctx.request.url;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = await ctx.cookies.get("oauth_state");

    // 驗證 state 參數
    if (!state || !storedState || state !== storedState) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "無效的請求狀態" };
      return;
    }

    if (!code) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "授權碼不存在" };
      return;
    }

    // 清除 state cookie
    ctx.cookies.delete("oauth_state");

    // 交換授權碼獲取 access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Google token exchange failed:", tokenData);
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "無法獲取存取權杖" };
      return;
    }

    // 使用 access token 獲取用戶資訊
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error("Google user info fetch failed:", userData);
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "無法獲取用戶資訊" };
      return;
    }

    // 檢查用戶是否已存在
    const client = await createDbConnection();
    try {
      const existingUsers = await client.query(
        `SELECT * FROM users WHERE email = ? OR google_id = ?`,
        [userData.email, userData.id]
      );

      let user;
      if (existingUsers.length > 0) {
        // 用戶已存在，更新 Google ID（如果沒有的話）
        user = existingUsers[0];
        if (!user.google_id) {
          await client.execute(
            `UPDATE users SET google_id = ?, avatar_url = ?, name = ? WHERE id = ?`,
            [userData.id, userData.picture, userData.name, user.id]
          );
          user.google_id = userData.id;
          user.avatar_url = userData.picture;
          user.name = userData.name;
        }
      } else {
        // 創建新用戶
        const result = await client.execute(
          `INSERT INTO users (email, google_id, avatar_url, name, password, auth_provider) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userData.email, userData.id, userData.picture, userData.name, "", "google"] // Google 用戶沒有密碼
        );
        
        user = {
          id: result.lastInsertId,
          email: userData.email,
          google_id: userData.id,
          avatar_url: userData.picture,
          name: userData.name,
        };
      }

    // 生成 JWT
    const jwt = await new SignJWT({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      auth_provider: "google",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime("1d")
      .sign(JWT_SECRET);

      // 重定向到前端並傳遞 token
      const redirectUrl = new URL("/profile/index_login.html", ctx.request.url.origin);
      redirectUrl.searchParams.set("token", jwt);
      redirectUrl.searchParams.set("login_success", "true");
      
      ctx.response.redirect(redirectUrl.toString());
      
    } finally {
      await client.close();
    }

  } catch (error) {
    console.error("Google OAuth callback error:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, message: "OAuth 認證過程發生錯誤" };
  }
});

// 獲取 Google 用戶資訊（受保護的路由）
googleOAuthRouter.get("/api/auth/google/profile", async (ctx) => {
  if (!ctx.state.user) {
    ctx.response.status = 401;
    ctx.response.body = { success: false, message: "未登入" };
    return;
  }

  const client = await createDbConnection();
  try {
    const users = await client.query(
      `SELECT id, email, name, avatar_url, google_id FROM users WHERE id = ?`,
      [ctx.state.user.id]
    );

    if (users.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, message: "用戶不存在" };
      return;
    }

    const user = users[0];
    ctx.response.body = {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        is_google_user: !!user.google_id,
      },
    };
  } catch (error) {
    console.error("Get user profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, message: "獲取用戶資訊失敗" };
  } finally {
    await client.close();
  }
});
