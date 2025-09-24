#!/usr/bin/env bash
set -euo pipefail

# 使用環境變數部署 Kubernetes 應用程式
# 將現有的 deno-web-app-secret 作為環境變數注入到 pods

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 部署 Deno Web App (使用 Secret 環境變數)${NC}"
echo "=================================================="

# 檢查 kubectl 是否可用
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl 未安裝或不在 PATH 中${NC}"
    exit 1
fi

# 檢查是否連接到 Kubernetes 集群
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ 無法連接到 Kubernetes 集群${NC}"
    echo "請確保 kubectl 已配置並連接到正確的集群"
    exit 1
fi

echo -e "${GREEN}✅ kubectl 連接正常${NC}"

# 設定變數
NAMESPACE="deno-web-app"
SECRET_NAME="deno-web-app-secret"
DEPLOYMENT_FILE="k8s-deployment.yaml"

# 檢查部署文件是否存在
if [[ ! -f "${DEPLOYMENT_FILE}" ]]; then
    echo -e "${RED}❌ 找不到部署文件: ${DEPLOYMENT_FILE}${NC}"
    exit 1
fi

# 顯示當前集群資訊
echo ""
echo -e "${BLUE}📊 當前集群資訊：${NC}"
kubectl config current-context
echo ""

# 檢查 Secret 是否存在
echo -e "${YELLOW}🔍 檢查 Secret...${NC}"
if kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" &> /dev/null; then
    echo -e "${GREEN}✅ Secret ${SECRET_NAME} 已存在${NC}"
    
    # 顯示 Secret 的鍵
    echo "Secret 包含的鍵："
    kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" -o jsonpath='{.data}' | jq -r 'keys[]' 2>/dev/null || {
        echo "- JWT_SECRET"
        echo "- DB_USER"
        echo "- DB_PASS"
    }
else
    echo -e "${RED}❌ Secret ${SECRET_NAME} 不存在${NC}"
    echo "請先創建包含以下鍵的 Secret："
    echo "- JWT_SECRET"
    echo "- DB_USER"
    echo "- DB_PASS"
    echo ""
    echo "創建範例："
    echo "kubectl create secret generic ${SECRET_NAME} \\"
    echo "  --namespace=${NAMESPACE} \\"
    echo "  --from-literal=JWT_SECRET=\"your-jwt-secret\" \\"
    echo "  --from-literal=DB_USER=\"your-db-user\" \\"
    echo "  --from-literal=DB_PASS=\"your-db-password\""
    exit 1
fi

# 取得映像路徑設定
echo ""
echo -e "${YELLOW}🐳 映像配置${NC}"
read -p "請輸入映像路徑 [asia-east1-docker.pkg.dev/YOUR_PROJECT/deno-web-app/deno-web-app:latest]: " IMAGE_PATH
if [[ -z "${IMAGE_PATH}" ]]; then
    IMAGE_PATH="asia-east1-docker.pkg.dev/YOUR_PROJECT/deno-web-app/deno-web-app:latest"
    echo -e "${YELLOW}⚠️  使用預設映像路徑，請確保已正確設定${NC}"
fi

# 確認部署
echo ""
echo -e "${BLUE}📋 部署摘要：${NC}"
echo "• 集群: $(kubectl config current-context)"
echo "• 命名空間: ${NAMESPACE}"
echo "• Secret: ${SECRET_NAME}"
echo "• 映像: ${IMAGE_PATH}"
echo ""
read -p "是否繼續部署？ [y/N]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  部署已取消${NC}"
    exit 0
fi

# 準備部署文件
echo -e "${YELLOW}📦 準備部署配置...${NC}"
TEMP_DEPLOYMENT="deployment-temp.yaml"

# 創建臨時部署文件，替換映像路徑
sed "s|asia-east1-docker.pkg.dev/PROJECT_ID/deno-web-app/deno-web-app:latest|${IMAGE_PATH}|g" "${DEPLOYMENT_FILE}" > "${TEMP_DEPLOYMENT}"

# 開始部署
echo -e "${YELLOW}🚀 開始部署...${NC}"

# 應用部署配置
kubectl apply -f "${TEMP_DEPLOYMENT}"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ 部署配置應用成功${NC}"
else
    echo -e "${RED}❌ 部署失敗${NC}"
    rm -f "${TEMP_DEPLOYMENT}"
    exit 1
fi

# 等待部署完成
echo -e "${YELLOW}⏳ 等待 Pod 就緒...${NC}"
kubectl wait --for=condition=ready pod -l app=deno-web-app -n "${NAMESPACE}" --timeout=300s

# 檢查部署狀態
echo ""
echo -e "${BLUE}📊 部署狀態：${NC}"
kubectl get pods -n "${NAMESPACE}" -l app=deno-web-app

echo ""
echo -e "${BLUE}🌐 服務狀態：${NC}"
kubectl get service -n "${NAMESPACE}"

# 獲取服務訪問資訊
echo ""
echo -e "${GREEN}🎉 部署完成！${NC}"
echo ""
echo -e "${BLUE}🔗 服務訪問資訊：${NC}"

# 檢查 Ingress IP
INGRESS_IP=$(kubectl get ingress deno-web-app-ingress -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
if [[ -n "${INGRESS_IP}" ]]; then
    echo "🌐 Ingress IP: http://${INGRESS_IP}"
else
    echo "⏳ Ingress IP 正在分配中..."
fi

# 檢查 LoadBalancer 服務
SERVICE_IP=$(kubectl get service deno-web-app-service -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
if [[ -n "${SERVICE_IP}" ]]; then
    echo "🚢 LoadBalancer IP: http://${SERVICE_IP}"
else
    echo "⏳ LoadBalancer IP 正在分配中..."
fi

echo ""
echo "您可以通過以下方式訪問應用程式："
echo "1. Ingress（推薦）: http://INGRESS_IP"
echo "2. LoadBalancer: http://SERVICE_IP"
echo ""
echo "監控 IP 分配狀況："
echo "kubectl get ingress deno-web-app-ingress -n ${NAMESPACE} --watch"

echo ""
echo -e "${BLUE}🛠️  管理命令：${NC}"
echo "• 查看 Pod 狀態: kubectl get pods -n ${NAMESPACE}"
echo "• 查看 Pod 日誌: kubectl logs -f deployment/deno-web-app -n ${NAMESPACE}"
echo "• 查看環境變數: kubectl exec -it deployment/deno-web-app -n ${NAMESPACE} -- env | grep -E '(JWT_SECRET|DB_USER|DB_PASS)'"
echo "• 查看 Ingress 狀態: kubectl get ingress -n ${NAMESPACE}"
echo "• 查看服務狀態: kubectl get service -n ${NAMESPACE}"
echo "• 重啟部署: kubectl rollout restart deployment/deno-web-app -n ${NAMESPACE}"
echo "• 刪除部署: kubectl delete -f ${DEPLOYMENT_FILE}"
echo ""
echo -e "${BLUE}🔍 環境變數驗證：${NC}"
echo "部署的 Pod 將從 Secret '${SECRET_NAME}' 讀取以下環境變數："
echo "• JWT_SECRET (從 Secret)"
echo "• DB_USER (從 Secret)"  
echo "• DB_PASS (從 Secret)"
echo "• PORT=8000 (固定值)"
echo "• HOST=0.0.0.0 (固定值)"
echo "• ENVIRONMENT=production (固定值)"

# 清理臨時文件
rm -f "${TEMP_DEPLOYMENT}"

echo ""
