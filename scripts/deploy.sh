#!/usr/bin/env bash
# 운영 서버(t-rex-revival.madcamp-kaist.org)에 최신 main 브랜치를 배포한다.
# 전제: 배포할 커밋은 이미 GitHub(origin/main)에 push되어 있어야 한다.
#
# 사용법:
#   npm run deploy                 # 코드만 배포 (git pull → build → 서비스 재시작)
#   npm run deploy -- --godot      # Godot 웹 빌드 산출물(wasm/pck 등)도 함께 올림
#
# 환경변수로 접속 정보를 덮어쓸 수 있다:
#   TREX_SSH_KEY, TREX_SERVER_USER, TREX_SERVER_HOST, TREX_REMOTE_DIR

set -euo pipefail

SSH_KEY="${TREX_SSH_KEY:-$HOME/.ssh/t-rex.pem}"
SERVER_USER="${TREX_SERVER_USER:-ubuntu}"
SERVER_HOST="${TREX_SERVER_HOST:-3.38.37.25}"
REMOTE_DIR="${TREX_REMOTE_DIR:-/opt/t-rex}"
SYNC_GODOT=false

for arg in "$@"; do
  case "$arg" in
    --godot) SYNC_GODOT=true ;;
    *) echo "알 수 없는 옵션: $arg" >&2; exit 1 ;;
  esac
done

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH 키를 찾을 수 없다: $SSH_KEY (TREX_SSH_KEY로 경로를 지정할 수 있다)" >&2
  exit 1
fi

SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=8)

ssh_run() {
  ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" "$@"
}

echo "==> 서버 연결 확인 ($SERVER_HOST)"
ssh_run "echo ok" >/dev/null

if [ "$SYNC_GODOT" = true ]; then
  GODOT_DIR="frontend/public/godot"
  if ls "$GODOT_DIR"/index.wasm >/dev/null 2>&1; then
    echo "==> Godot 웹 빌드 산출물 업로드 (git에 커밋되지 않는 파일)"
    scp "${SSH_OPTS[@]}" "$GODOT_DIR"/*.wasm "$GODOT_DIR"/*.pck "$GODOT_DIR"/*.js \
      "$GODOT_DIR"/*.html "$GODOT_DIR"/*.png \
      "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/frontend/public/godot/"
  else
    echo "==> 로컬에 Godot 빌드 산출물이 없다 (frontend/public/godot/index.wasm). --godot 건너뜀" >&2
  fi
fi

echo "==> 서버에서 origin/main으로 갱신"
ssh_run "cd $REMOTE_DIR && git fetch origin && git reset --hard origin/main"

echo "==> 의존성 설치 및 빌드"
# 운영 서버가 NODE_ENV=production이어도 빌드에 필요한 TypeScript/Vite는 devDependencies에
# 있으므로 명시적으로 포함한다. 빌드 후 런타임은 생성된 dist만 사용한다.
ssh_run "cd $REMOTE_DIR && npm ci --include=dev && npm run build"

echo "==> 백엔드 서비스 재시작"
ssh_run "sudo systemctl restart t-rex.service"

echo "==> 헬스체크"
sleep 2
ssh_run "curl -sf http://127.0.0.1:3001/api/health && echo"

echo "==> 배포 완료: https://t-rex-revival.madcamp-kaist.org"
