#!/bin/bash

# setup-gcp-secrets.sh - 設置 GCP Secret Manager 中的必要 secrets
# 使用方式: ./setup-gcp-secrets.sh <PROJECT_ID>

set -euo pipefail

# 檢查參數
if [ $# -ne 1 ]; then
    echo "使用方式: $0 <PROJECT_ID>"
    echo "範例: $0 my-gcp-project"
    exit 1
fi

PROJECT_ID="$1"

echo "🔐 開始設置 GCP Secret Manager secrets..."
echo "專案 ID: $PROJECT_ID"

# 必要的 secrets 列表
SECRETS=(
    "JWT_SECRET"
    "DB_PASS"
    "DB_USER"
)

# 生成隨機的 JWT_SECRET（32 位元組的 base64）
generate_jwt_secret() {
    openssl rand -base64 32
}

# 檢查並創建 secret
create_secret_if_not_exists() {
    local secret_name="$1"
    local secret_value="$2"
    
    echo "檢查 secret: $secret_name"
    
    if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" >/dev/null 2>&1; then
        echo "✅ Secret '$secret_name' 已存在"
        
        # 詢問是否要更新
        read -p "是否要更新 '$secret_name' 的值？(y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "$secret_value" | gcloud secrets versions add "$secret_name" \
                --project="$PROJECT_ID" \
                --data-file=-
            echo "✅ Secret '$secret_name' 已更新"
        fi
    else
        echo "🆕 創建新的 secret: $secret_name"
        
        # 創建 secret
        gcloud secrets create "$secret_name" \
            --project="$PROJECT_ID" \
            --replication-policy="automatic"
            
        # 添加值
        echo "$secret_value" | gcloud secrets versions add "$secret_name" \
            --project="$PROJECT_ID" \
            --data-file=-
            
        echo "✅ Secret '$secret_name' 已創建"
    fi
}

# 互動式設置每個 secret
echo
echo "請為每個 secret 提供值，或按 Enter 使用預設值："
echo

# JWT_SECRET - 自動生成
echo "設置 JWT_SECRET..."
JWT_SECRET=$(generate_jwt_secret)
echo "生成的 JWT_SECRET: ${JWT_SECRET:0:20}..."
create_secret_if_not_exists "JWT_SECRET" "$JWT_SECRET"

echo

# DB_USER
echo "設置 DB_USER..."
read -p "請輸入資料庫用戶名 (預設: admin): " db_user
db_user=${db_user:-admin}
create_secret_if_not_exists "DB_USER" "$db_user"

echo

# DB_PASS
echo "設置 DB_PASS..."
read -s -p "請輸入資料庫密碼 (預設: 隨機生成): " db_pass
echo
if [ -z "$db_pass" ]; then
    db_pass=$(openssl rand -base64 16)
    echo "生成的資料庫密碼: ${db_pass:0:8}..."
fi
create_secret_if_not_exists "DB_PASS" "$db_pass"

echo
echo "🎉 所有 secrets 設置完成！"
echo
echo "下一步："
echo "1. 確保你的 GKE 叢集已啟用 Secret Manager addon"
echo "2. 設置 Workload Identity 權限"
echo "3. 運行部署"
echo
echo "設置 Workload Identity 權限的指令："
echo "NAMESPACE=\"deno-web-app\""
echo "KSA_NAME=\"deno-web-app\""
echo
for secret_name in "${SECRETS[@]}"; do
    echo "gcloud secrets add-iam-policy-binding \"$secret_name\" \\"
    echo "  --role=roles/secretmanager.secretAccessor \\"
    echo "  --member=\"principal://iam.googleapis.com/projects/\$(gcloud config get-value project)/locations/global/workloadIdentityPools/\$(gcloud config get-value project).svc.id.goog/subject/ns/\$NAMESPACE/sa/\$KSA_NAME\" \\"
    echo "  --project=\"$PROJECT_ID\""
    echo
done
