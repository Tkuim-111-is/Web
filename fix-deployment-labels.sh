#!/usr/bin/env bash
set -euo pipefail

# 修復 Deployment selector 不匹配問題
# 專門處理 Helm 創建的 Deployment 轉換到 kubectl 管理的情況

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 修復 Deployment 標籤兼容性問題${NC}"
echo "=========================================="

NAMESPACE="deno-web-app"
DEPLOYMENT_NAME="deno-web-app"

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

# 檢查現有 Deployment
echo ""
echo -e "${YELLOW}🔍 檢查現有 Deployment...${NC}"

if ! kubectl get deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ 沒有發現衝突的 Deployment${NC}"
    echo "可以直接使用 ./deploy-with-env.sh 或 kubectl apply -f k8s-deployment.yaml"
    exit 0
fi

# 檢查 Deployment 標籤
echo "檢查 Deployment 標籤..."
DEPLOYMENT_LABELS=$(kubectl get deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}" -o jsonpath='{.spec.selector.matchLabels}')
echo "現有標籤: ${DEPLOYMENT_LABELS}"

# 檢查是否包含 Helm 標籤
if echo "${DEPLOYMENT_LABELS}" | grep -q "app.kubernetes.io"; then
    echo -e "${YELLOW}⚠️  發現 Helm 創建的 Deployment${NC}"
    echo ""
    echo "現有 Deployment 包含以下標籤："
    kubectl get deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}" -o jsonpath='{.spec.selector.matchLabels}' | jq '.' 2>/dev/null || echo "${DEPLOYMENT_LABELS}"
    echo ""
    echo "新的部署配置只包含簡單標籤: {\"app\":\"deno-web-app\"}"
    echo ""
    echo -e "${RED}由於 Deployment selector 不可變，需要刪除現有 Deployment。${NC}"
    echo ""
    
    read -p "是否要刪除現有 Deployment 並允許重新創建？ [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}⚠️  操作已取消${NC}"
        echo ""
        echo "替代方案："
        echo "1. 手動刪除: kubectl delete deployment ${DEPLOYMENT_NAME} -n ${NAMESPACE}"
        echo "2. 然後重新部署: ./deploy-with-env.sh"
        exit 0
    fi
    
    # 備份當前狀態（可選）
    echo ""
    echo -e "${BLUE}💾 備份當前 Deployment 配置...${NC}"
    kubectl get deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}" -o yaml > "backup-deployment-$(date +%Y%m%d-%H%M%S).yaml"
    echo "備份已保存到當前目錄"
    
    # 顯示當前 Pod 資訊
    echo ""
    echo -e "${BLUE}📊 當前 Pod 狀態：${NC}"
    kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${DEPLOYMENT_NAME}"
    
    # 刪除 Deployment
    echo ""
    echo -e "${YELLOW}🗑️  刪除現有 Deployment...${NC}"
    if kubectl delete deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}"; then
        echo -e "${GREEN}✅ Deployment 已刪除${NC}"
    else
        echo -e "${RED}❌ 刪除 Deployment 失敗${NC}"
        exit 1
    fi
    
    # 等待 Pod 清理
    echo ""
    echo -e "${YELLOW}⏳ 等待 Pod 清理完成...${NC}"
    kubectl wait --for=delete pods -l "app.kubernetes.io/name=${DEPLOYMENT_NAME}" -n "${NAMESPACE}" --timeout=120s || true
    
    # 檢查剩餘 Pod
    REMAINING_PODS=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${DEPLOYMENT_NAME}" --no-headers 2>/dev/null | wc -l || echo "0")
    if [[ "${REMAINING_PODS}" -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  仍有 ${REMAINING_PODS} 個 Pod 正在終止中...${NC}"
        kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${DEPLOYMENT_NAME}"
        echo "這是正常的，Pod 會在後台繼續清理"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 清理完成！${NC}"
    echo ""
    echo -e "${BLUE}📋 下一步：${NC}"
    echo "現在可以重新部署應用程式："
    echo "1. ./deploy-with-env.sh"
    echo "2. kubectl apply -f k8s-deployment.yaml"
    echo ""
    echo "新的 Deployment 將使用簡化的標籤結構，與 kubectl 完全兼容。"
    
else
    echo -e "${GREEN}✅ Deployment 標籤兼容${NC}"
    echo "現有 Deployment 使用兼容的標籤結構，可以直接更新。"
    
    # 顯示當前狀態
    echo ""
    echo -e "${BLUE}📊 當前狀態：${NC}"
    kubectl get deployment "${DEPLOYMENT_NAME}" -n "${NAMESPACE}"
    kubectl get pods -n "${NAMESPACE}" -l "app=${DEPLOYMENT_NAME}"
fi

echo ""
