#!/bin/sh
# 移植元（Liquibase）と同じく、起動のたびにマイグレーションを適用してからサーバーを起動する
set -eu

log_level="$(echo "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')"
# LOG_LEVEL は移植元（logging.level）に合わせて WARN と書けるが、uvicorn は
# warning しか受け付けず起動に失敗するため読み替える
if [ "$log_level" = "warn" ]; then
    log_level="warning"
fi

alembic upgrade head
exec uvicorn app.main:app_factory --factory --host 0.0.0.0 --port 8080 \
    --log-level "$log_level"
