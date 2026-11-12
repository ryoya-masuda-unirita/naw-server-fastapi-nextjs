FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /usr/local/bin/uv

# uv.lock も併せてコピーし --frozen を付けることで、ロックファイルで固定した
# バージョンをそのままイメージに焼き込む
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY waha_emulator/ ./waha_emulator/

# root で動かさないための実行ユーザー（server-local と同じ uid 1000）。
# ストリームファイルは server-local が作り、こちらは追記するだけ
RUN useradd --uid 1000 --create-home app \
    && mkdir -p /app/data/stream-output \
    && chown -R app:app /app/data

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    STREAM_ALLOWED_DIR="/app/data/stream-output"

USER app

EXPOSE 8080

# アクセスログは出さない。startsession のクエリ（authkey）がログに残るため
CMD ["uvicorn", "waha_emulator.main:app_factory", "--factory", \
     "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
