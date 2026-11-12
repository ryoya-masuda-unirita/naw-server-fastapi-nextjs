#!/usr/bin/env bash
# bastion経由でRDSへのSSHトンネルを張り、マイグレーション適用・seed.sql投入までを1コマンドで行う。
#
# 使い方:
#   PEM_KEY_PATH=~/.ssh/<キーペア名>.pem DB_PASSWORD=<db_password> \
#     bash infra/scripts/seed_via_bastion.sh [--skip-migrate]
#
# 必須の環境変数:
#   PEM_KEY_PATH  bastion接続用のSSH秘密鍵のパス
#   DB_PASSWORD   RDSのマスターパスワード（terraform outputには含まれない秘匿情報のため、呼び出し側から渡す）
#
# オプション:
#   --skip-migrate  seed投入前の `alembic upgrade head` をスキップする
#                    （CI/CDで既にマイグレーション済みの場合など）
#
# 実際のAIエンドポイント接続情報を使いたい場合:
#   このスクリプトと同じディレクトリに `.env`（.gitignore対象）を置き、AZURE_OPENAI_API_KEY / AZURE_OPENAI_ENDPOINT
#   を設定すると、seed.sql投入後（ダミー値で投入された後）に、AZURE_OPENAI_CHAT/AZURE_OPENAI_EMBEDDINGエンドポイントの
#   api_key・endpointを実際の値で上書きする。seed.sql自体は変更しない（ローカル開発でのdocker-compose経由の
#   投入等、既存の使われ方に影響を与えないため）。.envを置かない場合・各変数が未設定の場合はダミー値のまま。
#   雛形は .env.example を参照。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "${SCRIPT_DIR}")"
REPO_ROOT="$(dirname "${INFRA_DIR}")"
BACKEND_DIR="${REPO_ROOT}/backend"

if [ -f "${SCRIPT_DIR}/.env" ]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
fi

LOCAL_PORT=5433
SSH_USER="ec2-user"
SKIP_MIGRATE=0

for arg in "$@"; do
  case "${arg}" in
    --skip-migrate)
      SKIP_MIGRATE=1
      ;;
    *)
      echo "unknown option: ${arg}" >&2
      exit 1
      ;;
  esac
done

if [ -z "${PEM_KEY_PATH:-}" ]; then
  echo "PEM_KEY_PATH is required (bastion接続用のSSH秘密鍵のパス)" >&2
  exit 1
fi

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "DB_PASSWORD is required (RDSのマスターパスワード)" >&2
  exit 1
fi

echo "==> terraform outputから接続先を取得しています..."
RDS_ENDPOINT="$(cd "${INFRA_DIR}" && terraform output -raw rds_endpoint)"
BASTION_IP="$(cd "${INFRA_DIR}" && terraform output -raw bastion_public_ip)"
echo "RDS_ENDPOINT=${RDS_ENDPOINT}"
echo "BASTION_IP=${BASTION_IP}"

echo "==> SSHトンネルを確立しています (localhost:${LOCAL_PORT} -> ${RDS_ENDPOINT}:5432)..."
ssh -N \
  -i "${PEM_KEY_PATH}" \
  -o ExitOnForwardFailure=yes \
  -o StrictHostKeyChecking=accept-new \
  -L "${LOCAL_PORT}:${RDS_ENDPOINT}:5432" \
  "${SSH_USER}@${BASTION_IP}" &
TUNNEL_PID=$!

cleanup() {
  echo "==> SSHトンネルを終了しています (PID: ${TUNNEL_PID})..."
  kill "${TUNNEL_PID}" 2>/dev/null || true
  wait "${TUNNEL_PID}" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> トンネルの確立を待っています..."
for _ in $(seq 1 30); do
  if PGPASSWORD="${DB_PASSWORD}" psql -h localhost -p "${LOCAL_PORT}" -U root -d postgres -c '\q' 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! PGPASSWORD="${DB_PASSWORD}" psql -h localhost -p "${LOCAL_PORT}" -U root -d postgres -c '\q' 2>/dev/null; then
  echo "SSHトンネル経由でRDSに接続できませんでした" >&2
  exit 1
fi

if [ "${SKIP_MIGRATE}" -eq 0 ]; then
  echo "==> マイグレーションを適用しています..."
  (
    cd "${BACKEND_DIR}"
    DATABASE_URL="postgresql+asyncpg://root:${DB_PASSWORD}@localhost:${LOCAL_PORT}/postgres" \
      uv run alembic upgrade head
  )
else
  echo "==> --skip-migrateが指定されたため、マイグレーションをスキップします"
fi

echo "==> シードデータを投入しています..."
PGPASSWORD="${DB_PASSWORD}" psql -h localhost -p "${LOCAL_PORT}" -U root -d postgres < "${BACKEND_DIR}/seed.sql"

if [ -n "${AZURE_OPENAI_API_KEY:-}" ]; then
  echo "==> AZURE_OPENAI_API_KEYが設定されているため、AIエンドポイントのapi_keyを実際の値で上書きします..."
  # psqlの-v/:'var'展開がbastion側の環境で機能しなかったため、bash側でSQLリテラル用に
  # シングルクォートをエスケープ(''に置換)してから直接埋め込む
  ESCAPED_API_KEY="${AZURE_OPENAI_API_KEY//\'/\'\'}"
  PGPASSWORD="${DB_PASSWORD}" psql -h localhost -p "${LOCAL_PORT}" -U root -d postgres \
    -c "UPDATE tenant_endpoints SET api_key = '${ESCAPED_API_KEY}' WHERE type IN ('AZURE_OPENAI_CHAT', 'AZURE_OPENAI_EMBEDDING')"
else
  echo "==> AZURE_OPENAI_API_KEYが未設定のため、api_keyはダミー値のままにします"
fi

if [ -n "${AZURE_OPENAI_ENDPOINT:-}" ]; then
  echo "==> AZURE_OPENAI_ENDPOINTが設定されているため、AIエンドポイントのendpointを実際の値で上書きします..."
  ESCAPED_ENDPOINT="${AZURE_OPENAI_ENDPOINT//\'/\'\'}"
  PGPASSWORD="${DB_PASSWORD}" psql -h localhost -p "${LOCAL_PORT}" -U root -d postgres \
    -c "UPDATE tenant_endpoints SET endpoint = '${ESCAPED_ENDPOINT}' WHERE type IN ('AZURE_OPENAI_CHAT', 'AZURE_OPENAI_EMBEDDING')"
else
  echo "==> AZURE_OPENAI_ENDPOINTが未設定のため、endpointはダミー値のままにします"
fi

echo "==> 完了しました"
