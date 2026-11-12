#!/bin/sh
# 移植元（Liquibase）と同じく、起動のたびにマイグレーションを適用してからサーバーを起動する
set -eu

log_level="$(echo "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')"
# LOG_LEVEL は移植元（logging.level）と同じレベル名で書けるが、uvicorn が受け付けない
# 名前（warn・fatal・off）だと起動に失敗するため読み替える（アプリ側は Settings で読み替える）
case "$log_level" in
    warn) log_level="warning" ;;
    fatal | off) log_level="critical" ;;
esac

alembic upgrade head
exec uvicorn app.main:app_factory --factory --host 0.0.0.0 --port 8080 \
    --log-level "$log_level"
