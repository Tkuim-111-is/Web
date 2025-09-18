import { Router } from "https://deno.land/x/oak/mod.ts";

const versionRouter = new Router();

// 獲取 git commit hash
async function getGitCommitHash(): Promise<string> {
  try {
    // 嘗試從 git 命令獲取當前 commit hash
    const process = new Deno.Command("git", {
      args: ["rev-parse", "--short", "HEAD"],
      stdout: "piped",
      stderr: "piped",
    });
    
    const { code, stdout } = await process.output();
    
    if (code === 0) {
      const hash = new TextDecoder().decode(stdout).trim();
      return hash;
    } else {
      // 如果 git 命令失敗，嘗試從環境變數獲取（適用於部署環境）
      const envHash = Deno.env.get("GIT_COMMIT_HASH") || Deno.env.get("GITHUB_SHA");
      if (envHash) {
        return envHash.substring(0, 7); // 取前7個字符
      }
      return "unknown";
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] [version.ts] 獲取 git commit hash 失敗:`, error);
    // 嘗試從環境變數獲取
    const envHash = Deno.env.get("GIT_COMMIT_HASH") || Deno.env.get("GITHUB_SHA");
    if (envHash) {
      return envHash.substring(0, 7);
    }
    return "unknown";
  }
}

// 版本信息 API
versionRouter.get("/api/version", async (ctx) => {
  try {
    const commitHash = await getGitCommitHash();
    const buildTime = new Date().toISOString();
    
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = {
      success: true,
      data: {
        commitHash,
        buildTime
      }
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ERROR] [version.ts] 版本 API 錯誤:`, error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "獲取版本信息失敗",
      error: error instanceof Error ? error.message : "未知錯誤"
    };
  }
});

export { versionRouter };
