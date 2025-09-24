// utils/secrets.ts - 統一處理 Secret Manager 檔案和環境變數讀取
export function getSecret(secretName: string): string {
  // 優先從掛載的檔案讀取（GKE Secret Manager 外掛程式）
  const secretFile = `/var/secrets/${secretName}.txt`;
  
  try {
    const secretFromFile = Deno.readTextFileSync(secretFile).trim();
    console.log(`[${new Date().toISOString()}] [INFO] 從檔案讀取 ${secretName}: ${secretFile}`);
    return secretFromFile;
  } catch (_error) {
    // 如果檔案不存在，則從環境變數讀取（備用方案）
    const secretFromEnv = Deno.env.get(secretName);
    if (secretFromEnv) {
      console.log(`[${new Date().toISOString()}] [INFO] 從環境變數讀取 ${secretName}`);
      return secretFromEnv;
    }
    
    throw new Error(`${secretName} 未設定 - 檢查 Secret Manager 掛載或環境變數`);
  }
}

export function getSecretOptional(secretName: string, defaultValue: string = ""): string {
  try {
    return getSecret(secretName);
  } catch (_error) {
    console.log(`[${new Date().toISOString()}] [WARN] ${secretName} 未設定，使用預設值`);
    return defaultValue;
  }
}
