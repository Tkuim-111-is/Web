# GCP Secret Manager 設置指南

## 問題描述

部署失敗是因為 GCP Secret Manager 中缺少必要的 secrets：`JWT_SECRET`、`DB_PASS`、`DB_USER`。

## 解決方案

### 方案 1: 自動設置（推薦）

重新運行 GitHub Actions 部署，現在的 workflow 會自動檢查並創建缺失的 secrets。

### 方案 2: 手動設置

#### 使用提供的腳本

```bash
# 在本機執行
./setup-gcp-secrets.sh YOUR_PROJECT_ID
```

#### 手動使用 gcloud 指令

```bash
# 設置專案 ID
PROJECT_ID="YOUR_PROJECT_ID"

# 創建 JWT_SECRET（隨機生成）
JWT_SECRET=$(openssl rand -base64 32)
gcloud secrets create JWT_SECRET --project="$PROJECT_ID" --replication-policy="automatic"
echo "$JWT_SECRET" | gcloud secrets versions add JWT_SECRET --project="$PROJECT_ID" --data-file=-

# 創建 DB_USER
gcloud secrets create DB_USER --project="$PROJECT_ID" --replication-policy="automatic"
echo "admin" | gcloud secrets versions add DB_USER --project="$PROJECT_ID" --data-file=-

# 創建 DB_PASS（隨機生成）
DB_PASS=$(openssl rand -base64 16)
gcloud secrets create DB_PASS --project="$PROJECT_ID" --replication-policy="automatic"
echo "$DB_PASS" | gcloud secrets versions add DB_PASS --project="$PROJECT_ID" --data-file=-
```

## 驗證

檢查 secrets 是否已創建：

```bash
gcloud secrets list --project=YOUR_PROJECT_ID
```

## 重新部署

創建 secrets 後，重新觸發 GitHub Actions 部署：

1. 推送新的提交，或
2. 在 GitHub Actions 頁面手動重新運行失敗的 workflow

## 技術細節

- 應用程式使用 `getSecret()` 函數從 `/var/secrets/` 讀取掛載的 secrets
- 如果檔案不存在，會嘗試從環境變數讀取作為備用方案
- GKE Secret Manager addon 將 secrets 作為檔案掛載到 Pod 中

## 故障排除

如果仍然有問題：

1. 檢查 GKE 叢集是否啟用了 Secret Manager addon
2. 確認 Workload Identity 權限已正確設置
3. 檢查 Pod 日誌：`kubectl logs -n deno-web-app -l app.kubernetes.io/name=deno-web-app`
