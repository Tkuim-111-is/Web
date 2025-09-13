#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * 診斷腳本 - 檢查 OpenTelemetry 整合問題
 */

console.log("🔍 OpenTelemetry 整合診斷\n");

// 1. 檢查檔案是否存在
const requiredFiles = [
  "server.ts",
  "otel.ts", 
  "middleware/telemetry.ts",
  "utils/db-tracer.ts",
  "api/health.ts",
  "import_map.json",
];

console.log("📁 檢查必要檔案:");
for (const file of requiredFiles) {
  try {
    const stat = await Deno.stat(file);
    console.log(`✅ ${file} - 存在 (${stat.size} bytes)`);
  } catch {
    console.log(`❌ ${file} - 不存在`);
  }
}

// 2. 檢查環境變數
console.log("\n🔧 檢查環境變數:");
const envVars = [
  "JWT_SECRET",
  "DB_HOST", 
  "DB_USER",
  "DB_NAME",
  "SERVICE_NAME",
  "OTEL_COLLECTOR_URL",
];

for (const envVar of envVars) {
  const value = Deno.env.get(envVar);
  if (value) {
    console.log(`✅ ${envVar} - 已設定`);
  } else {
    console.log(`⚠️  ${envVar} - 未設定`);
  }
}

// 3. 測試 import_map.json
console.log("\n📦 檢查 import map:");
try {
  const importMapContent = await Deno.readTextFile("import_map.json");
  const importMap = JSON.parse(importMapContent);
  console.log(`✅ import_map.json - 有效 (${Object.keys(importMap.imports).length} 個 imports)`);
  
  // 列出 OpenTelemetry 相關的 imports
  for (const [key, value] of Object.entries(importMap.imports)) {
    if (key.includes("opentelemetry")) {
      console.log(`   - ${key}: ${value}`);
    }
  }
} catch (error) {
  console.log(`❌ import_map.json - 錯誤: ${error.message}`);
}

// 4. 測試基本的 TypeScript 編譯
console.log("\n🔨 測試 TypeScript 編譯:");
try {
  const process = new Deno.Command("deno", {
    args: ["check", "--import-map=import_map.json", "server.ts"],
    stdout: "piped",
    stderr: "piped",
  });
  
  const { code, stdout, stderr } = await process.output();
  
  if (code === 0) {
    console.log("✅ TypeScript 編譯 - 成功");
  } else {
    console.log("❌ TypeScript 編譯 - 失敗");
    const errorText = new TextDecoder().decode(stderr);
    console.log("錯誤訊息:");
    console.log(errorText);
  }
} catch (error) {
  console.log(`❌ 無法執行 TypeScript 檢查: ${error.message}`);
}

// 5. 測試伺服器是否運行
console.log("\n🌐 檢查伺服器狀態:");
const endpoints = [
  "http://localhost:8000/health",
  "http://localhost:8000/ready",
  "http://localhost:8000/live", 
  "http://localhost:8000/metrics",
];

for (const endpoint of endpoints) {
  try {
    const response = await fetch(endpoint, { 
      signal: AbortSignal.timeout(2000) // 2 秒超時
    });
    console.log(`✅ ${endpoint} - ${response.status} ${response.statusText}`);
  } catch (error) {
    if (error.name === "TimeoutError") {
      console.log(`⏱️  ${endpoint} - 超時`);
    } else {
      console.log(`❌ ${endpoint} - ${error.message}`);
    }
  }
}

console.log("\n📋 診斷完成");
console.log("\n💡 建議:");
console.log("1. 如果 TypeScript 編譯失敗，請先修正編譯錯誤");
console.log("2. 如果伺服器未運行，請執行: deno task dev");
console.log("3. 如果端點無法訪問，檢查伺服器是否正確啟動");
console.log("4. 確保所有必要的環境變數都已設定");
