# GKE Kubernetes 部署指南

本文檔提供將應用程序部署到 Google Kubernetes Engine (GKE) 的詳細說明。

## 前置條件

- Google Cloud Platform (GCP) 帳戶
- 已啟用結算的 GCP 項目
- 安裝 [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- 安裝 [kubectl](https://kubernetes.io/docs/tasks/tools/)
- 安裝 [kustomize](https://kubectl.docs.kubernetes.io/installation/kustomize/)

## 設置 GKE 集群

我們提供了一個腳本來幫助您設置 GKE 集群。執行：

```bash
./scripts/setup-gke.sh --project-id YOUR_GCP_PROJECT_ID
```

您可以使用其他選項自定義集群設置：

```bash
./scripts/setup-gke.sh --help
```

## GitHub Actions 配置

要啟用自動部署到 GKE，請在 GitHub 存儲庫設置中添加以下密鑰：

1. `GKE_PROJECT` - 您的 GCP 項目 ID
2. `GKE_CLUSTER` - 您的 GKE 集群名稱
3. `GKE_ZONE` - 您的 GKE 集群區域
4. `GKE_SA_KEY` - 服務帳戶密鑰（JSON 格式）

服務帳戶密鑰可以通過 `setup-gke.sh` 腳本生成，或按照以下步驟手動創建：

1. 在 GCP 控制台中創建一個服務帳戶
2. 授予該帳戶 `roles/container.developer` 角色
3. 創建並下載 JSON 密鑰
4. 將密鑰內容添加到 GitHub 密鑰 `GKE_SA_KEY` 中

## Kubernetes 資源

所有 Kubernetes 配置文件都位於 `k8s/` 目錄中：

- `deployment.yaml` - 定義應用程序部署
- `service.yaml` - 定義服務
- `ingress.yaml` - 定義入口配置
- `configmap.yaml` - 定義配置映射
- `kustomization.yaml` - Kustomize 配置

## 手動部署

如果您需要手動部署應用程序，請按照以下步驟操作：

1. 設置 GKE 憑證：

```bash
gcloud container clusters get-credentials YOUR_CLUSTER_NAME --zone YOUR_ZONE --project YOUR_PROJECT_ID
```

2. 部署應用程序：

```bash
cd k8s
kustomize build . | kubectl apply -f -
```

3. 檢查部署狀態：

```bash
kubectl get deployments
kubectl get services
kubectl get pods
```

## 自動部署

每當您將代碼推送到 `develop` 或 `release` 分支，或創建新標籤（如 `v1.0.0`）時，GitHub Actions 將自動：

1. 構建 Docker 映像
2. 推送映像到 GitHub Container Registry
3. 部署應用程序到 GKE

您可以在 GitHub 存儲庫的 Actions 選項卡中查看部署進度。

## 故障排除

如果部署失敗，請檢查：

1. GitHub Actions 日誌中的錯誤
2. Kubernetes 資源狀態：

```bash
kubectl describe deployment deno-web-app
kubectl describe pods -l app=deno-web-app
kubectl logs -l app=deno-web-app
```

## 清理資源

要刪除所有資源，請執行：

```bash
kubectl delete namespace deno-web
```

要刪除整個 GKE 集群，請執行：

```bash
gcloud container clusters delete YOUR_CLUSTER_NAME --zone YOUR_ZONE
```
