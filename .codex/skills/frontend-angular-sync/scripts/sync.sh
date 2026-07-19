#!/usr/bin/env bash
#
# secuaigent/client (Angular) を frontend-angular/ に丸ごと同期し、
# モノレポ向けの設定差分を再適用する。
#
# Usage:
#   bash .codex/skills/frontend-angular-sync/scripts/sync.sh [secuaigent/client のパス] [--force]
#
# デフォルトの参照元: ~/Documents/secuaigent/client

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TARGET_DIR="$REPO_ROOT/frontend-angular"

SRC_DIR="${1:-$HOME/Documents/secuaigent/client}"
FORCE=""
for arg in "$@"; do
  if [[ "$arg" == "--force" ]]; then
    FORCE="1"
  fi
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "参照元が見つかりません: $SRC_DIR" >&2
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "同期先が見つかりません: $TARGET_DIR" >&2
  exit 1
fi

if [[ -z "$FORCE" ]]; then
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain -- frontend-angular)" ]]; then
    echo "frontend-angular/ に未コミットの変更があります。先にコミット/stashするか、--force を付けて実行してください。" >&2
    exit 1
  fi
fi

echo "== 0. secuaigent/client の develop ブランチを最新化 =="

if ! git -C "$SRC_DIR" diff --quiet || ! git -C "$SRC_DIR" diff --cached --quiet; then
  echo "$SRC_DIR の追跡済みファイルに未コミットの変更があります。先にコミット/stashしてから実行してください。" >&2
  exit 1
fi

git -C "$SRC_DIR" fetch origin
git -C "$SRC_DIR" checkout develop
git -C "$SRC_DIR" pull --ff-only origin develop

echo "== 1. secuaigent/client を frontend-angular/ に同期 =="
echo "  参照元: $SRC_DIR"
echo "  同期先: $TARGET_DIR"

rsync -a --delete \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude ".angular/" \
  --exclude "dist/" \
  --exclude "coverage/" \
  --exclude ".gitlab-ci.yml" \
  --exclude "Dockerfile.dev" \
  "$SRC_DIR/" "$TARGET_DIR/"

echo "== 2. モノレポ向け設定を再適用 =="

# proxy.conf.local.js: docker-compose経由(BACKEND_PROXY_TARGET環境変数)でもホスト直起動でも
# 動くよう、単純なsed置換ではなくファイル全体を環境変数対応版で上書きする。
# 単純なsed置換だと、upstream側のファイル形式が変わった際にこの環境変数対応ロジックごと
# 失われてdocker-compose環境で接続不能になる（過去に実際発生した障害）。
PROXY_LOCAL="$TARGET_DIR/proxy.conf.local.js"
if [[ -f "$PROXY_LOCAL" ]]; then
  cat > "$PROXY_LOCAL" <<'PROXYEOF'
// バックエンドの転送先。docker-compose経由で起動する場合、コンテナ間通信用のアドレス
// （例: http://backend:8000）を環境変数BACKEND_PROXY_TARGETで注入する。未設定時は
// ホストで直接 `npm start` する既存の運用に合わせ、localhost:8001にフォールバックする。
const backendTarget = process.env.BACKEND_PROXY_TARGET || 'http://localhost:8001';

module.exports = {
  '/api': {
    target: backendTarget,
    secure: false,
    changeOrigin: true,
  },
  '/auth': {
    target: backendTarget,
    secure: false,
    changeOrigin: true,
    // ブラウザのページナビゲーション（Accept: text/html）はAngularに返す
    // API呼び出し（POST /auth/login 等）はバックエンドに転送する
    // /auth/login はAngularのページURL兼APIのパスです。ブラウザがページ遷移で GET /auth/login をリクエストするとき（Accept: text/html）はバックエンドに転送せず Angular の index.html を返します。POST /auth/login などのAPI呼び出しはそのままバックエンドへ転送します。
    bypass: function (req) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return '/index.html';
      }
    },
  },
};
PROXYEOF
  echo "  proxy.conf.local.js: BACKEND_PROXY_TARGET環境変数対応版で上書き"
fi

# proxy.conf.dev.js: 開発サーバーURLを FastAPI (8001) に向ける
PROXY_DEV="$TARGET_DIR/proxy.conf.dev.js"
if [[ -f "$PROXY_DEV" ]]; then
  sed -i '' \
    -e "s#^const DEV_SERVER = .*;#const DEV_SERVER = 'http://localhost:8001';#" \
    -e "s#^// TODO: 開発サーバーのURLを設定すること#// naw-server-fastapi-nextjs の FastAPI 開発サーバー#" \
    "$PROXY_DEV"
  echo "  proxy.conf.dev.js: DEV_SERVER -> http://localhost:8001"
fi

# angular.json: serve のポートを 4201 に固定
ANGULAR_JSON="$TARGET_DIR/angular.json"
if [[ -f "$ANGULAR_JSON" ]]; then
  python3 - "$ANGULAR_JSON" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)

for project in data.get("projects", {}).values():
    options = project.get("architect", {}).get("serve", {}).get("options")
    if options is not None:
        options["port"] = 4201

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
  echo "  angular.json: serve.options.port -> 4201"
fi

# 環境ファイル: 外部URL接続をモノレポ内バックエンドへの相対パス接続に変更
for ENV_FILE in \
  "$TARGET_DIR/src/environments/environment.development.ts" \
  "$TARGET_DIR/src/environments/environment.local.ts"
do
  if [[ -f "$ENV_FILE" ]]; then
    sed -i '' \
      -e "s#apiBaseUrl: '[^']*'#apiBaseUrl: '/api'#" \
      -e "s#authBaseUrl: '[^']*'#authBaseUrl: ''#" \
      -e "s#localhost:4200#localhost:4201#g" \
      -e "s#localhost:8080#localhost:8001#g" \
      "$ENV_FILE"
    echo "  $(basename "$ENV_FILE"): apiBaseUrl/authBaseUrl/コメント中のポート表記をモノレポ向けに変更"
  fi
done

# .vscode/launch.json: デバッグ起動URLのポートを 4201 に変更
LAUNCH_JSON="$TARGET_DIR/.vscode/launch.json"
if [[ -f "$LAUNCH_JSON" ]]; then
  sed -i '' "s#http://localhost:4200/#http://localhost:4201/#g" "$LAUNCH_JSON"
  echo "  .vscode/launch.json: localhost:4200 -> localhost:4201"
fi

# README.md: 起動URLのポート表記を 4201 に変更
README_MD="$TARGET_DIR/README.md"
if [[ -f "$README_MD" ]]; then
  sed -i '' "s#localhost:4200#localhost:4201#g" "$README_MD"
  echo "  README.md: localhost:4200 -> localhost:4201"
fi

# .github/workflows/deploy-dev.yml: 単独リポジトリ向けデプロイ設定なので無効化する
DEPLOY_YML="$TARGET_DIR/.github/workflows/deploy-dev.yml"
if [[ -f "$DEPLOY_YML" ]] && ! head -n 1 "$DEPLOY_YML" | grep -q "^# DISABLED"; then
  {
    echo "# DISABLED: モノレポ統合のため無効化。別リポジトリ用のデプロイ設定を参考として残す。"
    echo "# ルートの .github/workflows/ に移す場合はパス・トリガーを見直すこと。"
    echo "#"
    awk '{ if ($0 == "") print "#"; else print "# " $0 }' "$DEPLOY_YML"
  } > "$DEPLOY_YML.tmp"
  mv "$DEPLOY_YML.tmp" "$DEPLOY_YML"
  echo "  .github/workflows/deploy-dev.yml: 無効化コメントを追加"
fi

echo
echo "== 完了 =="
echo "次の手順を実施してください:"
echo "  1. cd frontend-angular && npm install"
echo "  2. git status / git diff frontend-angular で差分を確認"
echo "  3. 動作確認後、コミット"
