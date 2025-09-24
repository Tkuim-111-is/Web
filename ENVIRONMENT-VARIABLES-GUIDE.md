# 環境變數部署指南

## 概述

本專案現在支援將 Kubernetes Secret 中的密鑰直接作為**環境變數**注入到 Pod 中，這是最常見和直接的密鑰管理方式。

## 環境變數架構

### Secret 到環境變數的映射

現有的 `deno-web-app-secret` Secret 包含：

| Secret Key | 環境變數名稱 | 用途 | 讀取方式 |
|------------|--------------|------|----------|
| `JWT_SECRET` | `JWT_SECRET` | JWT 簽名密鑰 | `Deno.env.get("JWT_SECRET")` |
| `DB_USER` | `DB_USER` | 資料庫使用者 | `Deno.env.get("DB_USER")` |
| `DB_PASS` | `DB_PASS` | 資料庫密碼 | `Deno.env.get("DB_PASS")` |

### 應用程式環境變數配置

Pod 中設定的完整環境變數：

```yaml
env:
# 基本配置（固定值）
- name: PORT
  value: "8000"
- name: HOST  
  value: "0.0.0.0"
- name: ENVIRONMENT
  value: "production"

# 從 Secret 注入的敏感資料
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: deno-web-app-secret
      key: JWT_SECRET
- name: DB_USER
  valueFrom:
    secretKeyRef:
      name: deno-web-app-secret
      key: DB_USER
- name: DB_PASS
  valueFrom:
    secretKeyRef:
      name: deno-web-app-secret
      key: DB_PASS
```

## 部署方式

### 1. 本地部署

使用提供的部署腳本：

```bash
./deploy-with-env.sh
```

腳本會：
- ✅ 檢查 kubectl 連線
- ✅ 驗證 Secret 是否存在
- ✅ 配置映像路徑
- ✅ 部署應用程式（包含 Ingress）
- ✅ 顯示 Ingress 和 LoadBalancer 訪問資訊

### 2. GitHub Actions 自動部署

當推送到 `develop` 或 `Set/GKE` 分支時，會自動：
- 🔨 構建 Docker 映像
- 🚀 部署到 GKE 集群
- ✅ 驗證 Secret 存在
- 📊 顯示部署狀態

### 3. 手動 kubectl 部署

```bash
# 直接應用部署配置
kubectl apply -f k8s-deployment.yaml

# 檢查部署狀態
kubectl get pods -n deno-web-app
kubectl get service -n deno-web-app
kubectl get ingress -n deno-web-app
```

## 文件說明

### 新增文件

| 文件名 | 用途 | 說明 |
|--------|------|------|
| `k8s-deployment.yaml` | K8s 部署配置 | 定義如何將 Secret 作為環境變數注入，包含 Ingress 配置 |
| `deploy-with-env.sh` | 本地部署腳本 | 互動式部署工具 |
| `test-ingress-config.sh` | Ingress 配置測試 | 驗證 Ingress 配置是否正確 |
| `fix-deployment-labels.sh` | 部署修復工具 | 修復 Helm 到 kubectl 轉換的標籤不匹配問題 |
| `ENVIRONMENT-VARIABLES-GUIDE.md` | 使用指南 | 本文檔 |

### 更新文件

| 文件名 | 更新內容 |
|--------|----------|
| `.github/workflows/gke-deploy.yml` | 移除 Helm，添加 kubectl 部署步驟和智能 Deployment 處理 |

## 應用程式密鑰讀取

### 當前讀取策略

應用程式透過 `utils/secrets.ts` 讀取密鑰，優先順序：

1. **檔案讀取**: `/var/secrets/{SECRET_NAME}.txt`（GKE Secret Manager）
2. **環境變數**: `Deno.env.get(SECRET_NAME)`（**新的主要方式**）
3. **錯誤**: 如果都找不到則拋出錯誤

### 程式碼範例

```typescript
// utils/secrets.ts
export function getSecret(secretName: string): string {
  // 優先從掛載的檔案讀取（GKE Secret Manager）
  const secretFile = `/var/secrets/${secretName}.txt`;
  
  try {
    const secretFromFile = Deno.readTextFileSync(secretFile).trim();
    return secretFromFile;
  } catch (_error) {
    // 從環境變數讀取（現在是主要方式）
    const secretFromEnv = Deno.env.get(secretName);
    if (secretFromEnv) {
      return secretFromEnv;
    }
    
    throw new Error(`${secretName} 未設定`);
  }
}
```

## 服務訪問

### Ingress 訪問（推薦方式）

應用程式部署後會自動創建 Ingress，可通過 IP 直接訪問：

```bash
# 查看 Ingress 狀態
kubectl get ingress deno-web-app-ingress -n deno-web-app

# 獲取 Ingress IP
kubectl get ingress deno-web-app-ingress -n deno-web-app -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# 監控 Ingress IP 分配
kubectl get ingress deno-web-app-ingress -n deno-web-app --watch
```

**Ingress 配置特點：**
- ✅ 不需要設定網域名稱，可直接通過 IP 訪問
- ✅ 支援未來添加靜態 IP 和 SSL 憑證
- ✅ 更適合生產環境使用

### LoadBalancer 訪問（備用方式）

```bash
# 查看 LoadBalancer 服務狀態
kubectl get service deno-web-app-service -n deno-web-app

# 獲取 LoadBalancer IP
kubectl get service deno-web-app-service -n deno-web-app -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

## 環境變數驗證

### 檢查 Pod 中的環境變數

```bash
# 查看所有環境變數
kubectl exec -it deployment/deno-web-app -n deno-web-app -- env

# 查看特定的密鑰環境變數
kubectl exec -it deployment/deno-web-app -n deno-web-app -- env | grep -E '(JWT_SECRET|DB_USER|DB_PASS)'

# 驗證環境變數是否正確載入（不會顯示實際值）
kubectl exec -it deployment/deno-web-app -n deno-web-app -- sh -c 'echo "JWT_SECRET length: ${#JWT_SECRET}"'
```

### 應用程式日誌檢查

```bash
# 查看應用程式啟動日誌
kubectl logs -f deployment/deno-web-app -n deno-web-app

# 查看密鑰讀取日誌（應用程式會記錄從環境變數讀取）
kubectl logs deployment/deno-web-app -n deno-web-app | grep -i "從環境變數讀取"
```

## 管理命令

### Secret 管理

```bash
# 查看現有 Secret
kubectl get secret deno-web-app-secret -n deno-web-app -o yaml

# 更新 Secret 中的值
kubectl patch secret deno-web-app-secret -n deno-web-app \
  -p='{"data":{"JWT_SECRET":"'$(echo -n "new-secret" | base64)'"}}'

# 重啟部署以載入新的環境變數
kubectl rollout restart deployment/deno-web-app -n deno-web-app
```

### 部署管理

```bash
# 查看部署狀態
kubectl get deployment -n deno-web-app

# 擴縮容
kubectl scale deployment/deno-web-app --replicas=3 -n deno-web-app

# 查看部署歷史
kubectl rollout history deployment/deno-web-app -n deno-web-app

# 回滾到上一個版本
kubectl rollout undo deployment/deno-web-app -n deno-web-app
```

## 安全性考量

### 環境變數的安全性

✅ **優點**：
- 標準做法，廣泛支援
- 應用程式可直接使用 `Deno.env.get()`
- 不需要檔案系統掛載

⚠️ **注意事項**：
- 環境變數在 Pod 中可見
- 進程列表可能洩漏環境變數
- 需要適當的 RBAC 控制

### 最佳實踐

1. **最小權限原則**
   ```bash
   # 限制誰可以查看 Secret
   kubectl create rolebinding secret-reader --role=secret-reader --user=developer
   ```

2. **定期輪換密鑰**
   ```bash
   # 更新密鑰後重啟應用
   kubectl patch secret deno-web-app-secret -n deno-web-app -p='{"data":{"JWT_SECRET":"'$(openssl rand -base64 32 | base64 -w 0)'"}}'
   kubectl rollout restart deployment/deno-web-app -n deno-web-app
   ```

3. **監控訪問**
   ```bash
   # 開啟審計日誌來追蹤 Secret 訪問
   # （需要在集群層級配置）
   ```

## 故障排除

### 常見問題

1. **Deployment selector 不匹配錯誤**
   
   **錯誤信息：**
   ```
   The Deployment "deno-web-app" is invalid: spec.selector: Invalid value: 
   v1.LabelSelector{MatchLabels:map[string]string{"app":"deno-web-app", 
   "app.kubernetes.io/instance":"deno-web-app", "app.kubernetes.io/name":"deno-web-app"}}
   ```
   
   **原因：** 現有 Deployment 是 Helm 創建的，包含額外標籤，而新配置只有簡單標籤。
   
   **解決方案：**
   ```bash
   # 自動修復腳本
   ./fix-deployment-labels.sh
   
   # 或手動刪除並重新創建
   kubectl delete deployment deno-web-app -n deno-web-app
   kubectl apply -f k8s-deployment.yaml
   ```

2. **Pod 無法啟動**
   ```bash
   # 檢查 Secret 是否存在
   kubectl get secret deno-web-app-secret -n deno-web-app
   
   # 檢查 Pod 狀態
   kubectl describe pod -l app=deno-web-app -n deno-web-app
   ```

3. **環境變數未載入**
   ```bash
   # 檢查部署配置
   kubectl get deployment deno-web-app -n deno-web-app -o yaml | grep -A 20 env:
   
   # 檢查 Secret 是否有正確的 key
   kubectl get secret deno-web-app-secret -n deno-web-app -o jsonpath='{.data}' | jq 'keys'
   ```

4. **應用程式無法讀取密鑰**
   ```bash
   # 檢查應用程式日誌
   kubectl logs -f deployment/deno-web-app -n deno-web-app
   
   # 進入 Pod 檢查環境變數
   kubectl exec -it deployment/deno-web-app -n deno-web-app -- env | grep -E '(JWT|DB)'
   ```

5. **Ingress 警告**
   
   **警告信息：**
   ```
   Warning: annotation "kubernetes.io/ingress.class" is deprecated, 
   please use 'spec.ingressClassName' instead
   ```
   
   **說明：** 這個警告已在新版本配置中修復，使用 `spec.ingressClassName: gce`。

## 與其他方案比較

| 方案 | 複雜度 | 安全性 | 效能 | 適用場景 |
|------|--------|--------|------|----------|
| **環境變數** | 低 | 中 | 高 | 大部分應用程式 |
| Secret Manager 檔案掛載 | 高 | 高 | 中 | 高度敏感應用程式 |
| ConfigMap | 低 | 低 | 高 | 非敏感配置 |
| External Secrets | 高 | 高 | 中 | 企業級部署 |

## 結論

使用環境變數方式將 Kubernetes Secret 注入到 Pod 是：

✅ **最簡單** - 標準的 Kubernetes 做法
✅ **最直接** - 應用程式無需修改  
✅ **最兼容** - 與現有的 `utils/secrets.ts` 完全兼容
✅ **最高效** - 無需檔案 I/O 操作

這種方式非常適合您的 Deno Web 應用程式，提供了簡潔性和安全性的良好平衡。
