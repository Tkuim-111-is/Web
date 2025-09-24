import { Router } from "https://deno.land/x/oak/mod.ts";
import { Client } from "https://deno.land/x/mysql/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

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
      const insertResult = await client.execute(
        `INSERT INTO users (email, password) 
         values (?, ?)`,
        [email, hashedPassword]
      );

      const userId = insertResult.lastInsertId;
      ctx.response.body = { success: true, id: userId };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { success: false, message: "沒有提供請求數據" };
    }
  } catch (error) {
    console.error("註冊錯誤:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      success: false, 
      message: "服務器錯誤，請稍後再試" 
    };
  }
});