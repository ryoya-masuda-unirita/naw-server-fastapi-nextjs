FROM python:3.12-slim

# ビルドコンテキストはリポジトリのルート（waha-emulator/docker-compose.yml の build.context）。
# エミュレーターは生成AIアダプタ（generative-ai-adapter/）をパス依存で使うため、
# uv.lock の相対パス（../generative-ai-adapter/...）が解決できる位置に並べて置く
WORKDIR /app/waha-emulator

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /usr/local/bin/uv

# uv.lock も併せてコピーし --frozen を付けることで、ロックファイルで固定した
# バージョンをそのままイメージに焼き込む。先に依存パッケージ（アダプタ）の定義を
# コピーする（ソースのコピーより前にし、依存の層をキャッシュできるようにする）
COPY generative-ai-adapter/generative-ai-core/pyproject.toml /app/generative-ai-adapter/generative-ai-core/pyproject.toml
COPY generative-ai-adapter/generative-ai-adapter/pyproject.toml /app/generative-ai-adapter/generative-ai-adapter/pyproject.toml
COPY generative-ai-adapter/embedding-adapter/pyproject.toml /app/generative-ai-adapter/embedding-adapter/pyproject.toml
COPY generative-ai-adapter/generative-ai-core/src/ /app/generative-ai-adapter/generative-ai-core/src/
COPY generative-ai-adapter/generative-ai-adapter/src/ /app/generative-ai-adapter/generative-ai-adapter/src/
COPY generative-ai-adapter/embedding-adapter/src/ /app/generative-ai-adapter/embedding-adapter/src/
COPY waha-emulator/pyproject.toml waha-emulator/uv.lock ./
RUN uv sync --no-dev --frozen

COPY waha-emulator/waha_emulator/ ./waha_emulator/

# root で動かさないための実行ユーザー（server-local と同じ uid 1000）。
# ストリームファイルは server-local が作り、こちらは追記するだけ
RUN useradd --uid 1000 --create-home app \
    && mkdir -p /app/data/stream-output \
    && chown -R app:app /app/data

ENV PATH="/app/waha-emulator/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    STREAM_ALLOWED_DIR="/app/data/stream-output"

USER app

EXPOSE 8080

# アクセスログは出さない。startsession のクエリ（authkey）がログに残るため
CMD ["uvicorn", "waha_emulator.main:app_factory", "--factory", \
     "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
