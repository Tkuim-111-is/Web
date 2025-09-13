#!/usr/bin/env -S deno run --allow-net

/**
 * 簡單的伺服器狀態檢查腳本
 */

const BASE_URL = "http://localhost:8000";

async function checkEndpoint(path: string): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    return {
      success: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function main() {
  console.log("🔍 檢查伺服器狀態...\n");

  const endpoints = [
    "/health",
    "/ready", 
    "/live",
    "/metrics",
  ];

  for (const endpoint of endpoints) {
    const result = await checkEndpoint(endpoint);
    
    if (result.success) {
      console.log(`✅ ${endpoint} - OK (${result.status})`);
    } else if (result.status) {
      console.log(`❌ ${endpoint} - Failed (${result.status})`);
    } else {
      console.log(`❌ ${endpoint} - Error: ${result.error}`);
    }
  }

  // 檢查 Prometheus 指標伺服器
  console.log("\n🔍 檢查 Prometheus 指標伺服器...");
  const metricsResult = await checkEndpoint(":9464/metrics");
  if (metricsResult.success) {
    console.log(`✅ Prometheus metrics server - OK (${metricsResult.status})`);
  } else {
    console.log(`❌ Prometheus metrics server - ${metricsResult.error || metricsResult.status}`);
  }
}

if (import.meta.main) {
  await main();
}
