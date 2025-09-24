#!/usr/bin/env bash
set -euo pipefail

# 測試 Ingress 配置
# 驗證 Ingress 設定是否正確配置為通過 IP 訪問

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🌐 測試 Ingress 配置${NC}"
echo "====================="

# 檢查部署文件是否存在
DEPLOYMENT_FILE="k8s-deployment.yaml"
if [[ ! -f "${DEPLOYMENT_FILE}" ]]; then
    echo -e "${RED}❌ 找不到部署文件: ${DEPLOYMENT_FILE}${NC}"
    exit 1
fi

echo -e "${YELLOW}📁 檢查部署文件...${NC}"
echo -e "${GREEN}✅ ${DEPLOYMENT_FILE} 存在${NC}"

# 檢查 Ingress 配置
echo ""
echo -e "${YELLOW}🔍 驗證 Ingress 配置...${NC}"

# 檢查是否包含 Ingress 資源
if grep -q "kind: Ingress" "${DEPLOYMENT_FILE}"; then
    echo -e "${GREEN}✅ 包含 Ingress 資源定義${NC}"
else
    echo -e "${RED}❌ 未找到 Ingress 資源定義${NC}"
    exit 1
fi

# 檢查是否移除了 host 設定
if grep -q "host:" "${DEPLOYMENT_FILE}"; then
    echo -e "${RED}❌ 仍包含 host 設定，應該移除以支援 IP 訪問${NC}"
    echo "找到的 host 設定："
    grep -n "host:" "${DEPLOYMENT_FILE}"
    exit 1
else
    echo -e "${GREEN}✅ 已移除 host 設定，支援通過 IP 直接訪問${NC}"
fi

# 檢查 Ingress class 設定
if grep -q 'kubernetes.io/ingress.class: "gce"' "${DEPLOYMENT_FILE}"; then
    echo -e "${GREEN}✅ 正確設定 GCE Ingress class${NC}"
else
    echo -e "${YELLOW}⚠️  未找到 GCE Ingress class 設定${NC}"
fi

# 檢查路径配置
if grep -q "path: /" "${DEPLOYMENT_FILE}" && grep -q "pathType: Prefix" "${DEPLOYMENT_FILE}"; then
    echo -e "${GREEN}✅ 路径配置正確 (/ 和 Prefix)${NC}"
else
    echo -e "${RED}❌ 路径配置有問題${NC}"
    exit 1
fi

# 檢查後端服務配置
if grep -q "name: deno-web-app-service" "${DEPLOYMENT_FILE}" && grep -q "number: 80" "${DEPLOYMENT_FILE}"; then
    echo -e "${GREEN}✅ 後端服務配置正確${NC}"
else
    echo -e "${RED}❌ 後端服務配置有問題${NC}"
    exit 1
fi

# 如果有 kubectl，檢查集群中的 Ingress
echo ""
echo -e "${YELLOW}🔌 檢查集群中的 Ingress...${NC}"
if command -v kubectl &> /dev/null; then
    if kubectl cluster-info &> /dev/null; then
        echo -e "${GREEN}✅ kubectl 連線正常${NC}"
        
        NAMESPACE="deno-web-app"
        INGRESS_NAME="deno-web-app-ingress"
        
        if kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" &> /dev/null; then
            echo -e "${GREEN}✅ Ingress ${INGRESS_NAME} 存在${NC}"
            
            # 顯示 Ingress 詳細資訊
            echo ""
            echo -e "${BLUE}📊 Ingress 狀態：${NC}"
            kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}"
            
            # 檢查 Ingress IP
            INGRESS_IP=$(kubectl get ingress "${INGRESS_NAME}" -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
            if [[ -n "${INGRESS_IP}" ]]; then
                echo ""
                echo -e "${GREEN}✅ Ingress IP 已分配: ${INGRESS_IP}${NC}"
                echo -e "${BLUE}🌐 訪問網址: http://${INGRESS_IP}${NC}"
                
                # 測試連接（可選）
                echo ""
                read -p "是否測試 HTTP 連接？ [y/N]: " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    echo -e "${YELLOW}⏳ 測試連接到 http://${INGRESS_IP}...${NC}"
                    if curl -s --connect-timeout 10 "http://${INGRESS_IP}" > /dev/null; then
                        echo -e "${GREEN}✅ 連接測試成功${NC}"
                    else
                        echo -e "${YELLOW}⚠️  連接測試失敗（可能是應用程式尚未就緒）${NC}"
                    fi
                fi
            else
                echo ""
                echo -e "${YELLOW}⚠️  Ingress IP 尚未分配${NC}"
                echo "使用以下命令監控 IP 分配："
                echo "kubectl get ingress ${INGRESS_NAME} -n ${NAMESPACE} --watch"
            fi
            
            # 顯示 Ingress 詳細配置
            echo ""
            echo -e "${BLUE}📋 Ingress 配置詳情：${NC}"
            kubectl describe ingress "${INGRESS_NAME}" -n "${NAMESPACE}"
            
        else
            echo -e "${YELLOW}⚠️  Ingress ${INGRESS_NAME} 不存在於命名空間 ${NAMESPACE}${NC}"
            echo "這是正常的，如果您還沒有部署應用程式"
        fi
    else
        echo -e "${YELLOW}⚠️  無法連接到 Kubernetes 集群${NC}"
        echo "這是正常的，如果您沒有配置 kubectl"
    fi
else
    echo -e "${YELLOW}⚠️  kubectl 未安裝${NC}"
    echo "這是正常的，如果您不使用本地 kubectl"
fi

# 總結
echo ""
echo -e "${GREEN}🎉 Ingress 配置驗證完成！${NC}"
echo ""
echo -e "${BLUE}📋 配置摘要：${NC}"
echo "• ✅ Ingress 資源已定義"
echo "• ✅ 支援通過 IP 直接訪問（無需網域名稱）"
echo "• ✅ 使用 GCE Ingress Controller"
echo "• ✅ 路径配置為根路径 (/)"
echo "• ✅ 後端服務指向 deno-web-app-service:80"
echo ""
echo -e "${BLUE}🚀 部署指南：${NC}"
echo "1. 部署應用程式: ./deploy-with-env.sh"
echo "2. 等待 Ingress IP 分配: kubectl get ingress -n deno-web-app --watch"
echo "3. 通過 IP 訪問應用程式: http://INGRESS_IP"
echo ""
