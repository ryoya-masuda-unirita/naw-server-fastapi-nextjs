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

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "${SCRIPT_DIR}")"
REPO_ROOT="$(dirname "${INFRA_DIR}")"
BACKEND_DIR="${REPO_ROOT}/backend"

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

echo "==> 完了しました"
