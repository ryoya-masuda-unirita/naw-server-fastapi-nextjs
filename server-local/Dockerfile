FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /usr/local/bin/uv

# uv.lock も併せてコピーし --frozen を付けることで、ロックファイルで固定した
# バージョンをそのままイメージに焼き込む
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY app/ ./app/
# 起動時に alembic upgrade head を実行するため、マイグレーション定義も含める
COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY docker-entrypoint.sh ./

# root で動かさないための実行ユーザー。データはボリューム（/app/data）に置くため、
# 書き込み先だけ所有者を変える
RUN useradd --uid 1000 --create-home app \
    && mkdir -p /app/data/stream-output \
    && chown -R app:app /app/data \
    && chmod +x /app/docker-entrypoint.sh

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL="sqlite+aiosqlite:////app/data/nawdb.sqlite3" \
    STREAM_OUTPUT_DIR="/app/data/stream-output"

USER app

EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
