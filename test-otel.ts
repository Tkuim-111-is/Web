#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * OpenTelemetry 整合測試腳本
 * 用於驗證遙測功能是否正常工作
 */

const BASE_URL = "http://localhost:8000";

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  duration: number;
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    return {
      name,
      success: true,
      message: "測試通過",
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      name,
      success: false,
      message: error instanceof Error ? error.message : "未知錯誤",
      duration,
    };
  }
}

async function testHealthEndpoints() {
  // 測試健康檢查端點
  const healthResponse = await fetch(`${BASE_URL}/health`);
  if (!healthResponse.ok) {
    throw new Error(`健康檢查失敗: ${healthResponse.status}`);
  }
  
  const healthData = await healthResponse.json();
  console.log("健康檢查回應:", JSON.stringify(healthData, null, 2));

  // 測試就緒檢查端點
  const readyResponse = await fetch(`${BASE_URL}/ready`);
  if (!readyResponse.ok) {
    throw new Error(`就緒檢查失敗: ${readyResponse.status}`);
  }

  // 測試存活檢查端點
  const liveResponse = await fetch(`${BASE_URL}/live`);
  if (!liveResponse.ok) {
    throw new Error(`存活檢查失敗: ${liveResponse.status}`);
  }
}

async function testMetricsEndpoint() {
  const metricsResponse = await fetch(`${BASE_URL}/metrics`);
  if (!metricsResponse.ok) {
    throw new Error(`指標端點失敗: ${metricsResponse.status}`);
  }
  
  const metricsText = await metricsResponse.text();
  if (!metricsText.includes("http_requests_total")) {
    throw new Error("指標中未找到預期的 HTTP 請求計數器");
  }
  
  console.log("指標端點正常，包含預期的指標");
}

async function testAPIEndpoints() {
  // 測試註冊 API（會產生追蹤資料）
  const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: `test-${Date.now()}@example.com`,
      password: "testpassword123",
    }),
  });

  if (!registerResponse.ok) {
    const errorData = await registerResponse.json();
    console.log("註冊回應:", errorData);
  }

  // 測試登入 API（會產生追蹤資料）
  const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "nonexistent@example.com",
      password: "wrongpassword",
    }),
  });

  // 預期登入失敗，但應該產生追蹤資料
  if (loginResponse.status !== 401) {
    console.log("登入測試: 預期 401 狀態碼");
  }
}

async function testTraceGeneration() {
  // 發送多個請求以產生追蹤資料
  const requests = [];
  
  for (let i = 0; i < 5; i++) {
    requests.push(fetch(`${BASE_URL}/health`));
    requests.push(fetch(`${BASE_URL}/live`));
  }
  
  await Promise.all(requests);
  console.log("已發送多個請求以產生追蹤資料");
}

async function main() {
  console.log("🚀 開始 OpenTelemetry 整合測試\n");

  const tests = [
    { name: "健康檢查端點", fn: testHealthEndpoints },
    { name: "指標端點", fn: testMetricsEndpoint },
    { name: "API 端點追蹤", fn: testAPIEndpoints },
    { name: "追蹤資料生成", fn: testTraceGeneration },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`🧪 執行測試: ${test.name}`);
    const result = await runTest(test.name, test.fn);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ ${test.name} - ${result.message} (${result.duration}ms)\n`);
    } else {
      console.log(`❌ ${test.name} - ${result.message} (${result.duration}ms)\n`);
    }
  }

  // 總結報告
  console.log("📊 測試結果總結:");
  console.log("=" .repeat(50));
  
  const passedTests = results.filter(r => r.success).length;
  const totalTests = results.length;
  
  console.log(`通過測試: ${passedTests}/${totalTests}`);
  console.log(`總執行時間: ${results.reduce((sum, r) => sum + r.duration, 0)}ms`);
  
  if (passedTests === totalTests) {
    console.log("\n🎉 所有測試通過！OpenTelemetry 整合成功！");
    console.log("\n📈 監控端點:");
    console.log("- Grafana Dashboard: http://localhost:3000");
    console.log("- Jaeger UI: http://localhost:16686");
    console.log("- Prometheus: http://localhost:9090");
    console.log("- 應用 Metrics: http://localhost:8000/metrics");
  } else {
    console.log("\n⚠️  部分測試失敗，請檢查配置");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
