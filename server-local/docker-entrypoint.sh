#!/bin/sh
# 移植元（Liquibase）と同じく、起動のたびにマイグレーションを適用してからサーバーを起動する
set -eu

alembic upgrade head
exec uvicorn app.main:app_factory --factory --host 0.0.0.0 --port 8080 \
    --log-level "$(echo "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')"
