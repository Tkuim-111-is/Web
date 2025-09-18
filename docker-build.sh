#!/usr/bin/env bash
set -euo pipefail

# 定義變數
IMAGE_NAME="deno-web-app"
IMAGE_TAG="latest"

# 顯示幫助訊息
show_help() {
  echo "用法: $0 [選項]"
  echo "選項:"
  echo "  -h, --help     顯示此幫助訊息"
  echo "  -t, --tag      指定映像標籤 (預設: latest)"
  echo "  -p, --push     構建後推送映像"
  echo "  -r, --run      構建後運行容器"
  echo "  --registry     指定容器註冊表 (例如: ghcr.io/username)"
}

# 解析命令行參數
PUSH=0
RUN=0
REGISTRY=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      exit 0
      ;;
    -t|--tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    -p|--push)
      PUSH=1
      shift
      ;;
    -r|--run)
      RUN=1
      shift
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    *)
      echo "未知選項: $1"
      show_help
      exit 1
      ;;
  esac
done

# 設定完整映像名稱
if [[ -n "$REGISTRY" ]]; then
  FULL_IMAGE_NAME="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
else
  FULL_IMAGE_NAME="$IMAGE_NAME:$IMAGE_TAG"
fi

echo "===== 開始構建 Docker 映像 ====="
echo "映像名稱: $FULL_IMAGE_NAME"

# 構建 Docker 映像
docker build -t "$FULL_IMAGE_NAME" .

echo "映像構建完成!"

# 如果需要推送映像
if [[ $PUSH -eq 1 ]]; then
  echo "===== 推送映像到註冊表 ====="
  
  if [[ -z "$REGISTRY" ]]; then
    echo "錯誤: 未指定註冊表。請使用 --registry 選項指定註冊表。"
    exit 1
  fi
  
  docker push "$FULL_IMAGE_NAME"
  echo "映像已推送: $FULL_IMAGE_NAME"
fi

# 如果需要運行容器
if [[ $RUN -eq 1 ]]; then
  echo "===== 運行 Docker 容器 ====="
  
  # 停止並移除舊容器（如果存在）
  docker rm -f deno-web-app 2>/dev/null || true
  
  # 運行新容器
  docker run -d --name deno-web-app \
    -p 8000:8000 \
    --env-file .env \
    --restart unless-stopped \
    "$FULL_IMAGE_NAME"
  
  echo "容器已啟動，可在 http://localhost:8000 訪問"
fi

echo "===== 完成 ====="
