FROM python:3.12-slim

# ビルドコンテキストはリポジトリのルート（onprem/docker-compose.yml の build.context）。
# エミュレーターは生成AIアダプタ・検索アダプタ（generative-ai-adapter/）をパス依存で使うため、
# uv.lock の相対パス（../generative-ai-adapter/...）が解決できる位置に並べて置く
WORKDIR /app/waha-emulator

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /usr/local/bin/uv

# ファイルのテキストの取り出し（Apache Tika）のため、Tika のサーバー（jar）と JRE を、この
# コンテナの中に入れる。移植元は Tika をアダプタのプロセスの中で使う。Python 版は、同じコンテナの
# 中で子プロセスとして起動し、localhost で呼ぶ（別のサービスにしない）。jar はビルドのときに
# 取得し、固定した SHA-512（server/Dockerfile と同じ値）で検証する。実行時にはダウンロードしない。
# tesseract は入れない（OCR はしない）
ARG TIKA_VERSION=3.1.0
ARG TIKA_SHA512=e9f6df28329cb36519b748e04eb9c96db2e776f4bfafcb92a48b799e9448ee182c908eeb3e807a98f6c59af79a01e72022d7f5654764342b6d6688c288817c8e
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless curl ca-certificates \
    && curl -fsSL -o /opt/tika-server.jar "https://archive.apache.org/dist/tika/${TIKA_VERSION}/tika-server-standard-${TIKA_VERSION}.jar" \
    && echo "${TIKA_SHA512}  /opt/tika-server.jar" | sha512sum -c - \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*
ENV TIKA_SERVER_JAR=/opt/tika-server.jar

# uv.lock も併せてコピーし --frozen を付けることで、ロックファイルで固定した
# バージョンをそのままイメージに焼き込む。先に依存パッケージ（アダプタ）の定義を
# コピーする（ソースのコピーより前にし、依存の層をキャッシュできるようにする）
COPY generative-ai-adapter/generative-ai-core/pyproject.toml /app/generative-ai-adapter/generative-ai-core/pyproject.toml
COPY generative-ai-adapter/generative-ai-adapter/pyproject.toml /app/generative-ai-adapter/generative-ai-adapter/pyproject.toml
COPY generative-ai-adapter/retrieval-adapter/pyproject.toml /app/generative-ai-adapter/retrieval-adapter/pyproject.toml
COPY generative-ai-adapter/generative-ai-core/src/ /app/generative-ai-adapter/generative-ai-core/src/
COPY generative-ai-adapter/generative-ai-adapter/src/ /app/generative-ai-adapter/generative-ai-adapter/src/
COPY generative-ai-adapter/retrieval-adapter/src/ /app/generative-ai-adapter/retrieval-adapter/src/
COPY generative-ai-adapter/embedding-adapter/pyproject.toml /app/generative-ai-adapter/embedding-adapter/pyproject.toml
COPY generative-ai-adapter/embedding-adapter/src/ /app/generative-ai-adapter/embedding-adapter/src/
COPY waha-emulator/pyproject.toml waha-emulator/uv.lock ./
RUN uv sync --no-dev --frozen

COPY waha-emulator/waha_emulator/ ./waha_emulator/

# root で動かさないための実行ユーザー（server-local と同じ uid 1000）。
# ストリームファイルは server-local が作り、こちらは追記するだけ。
# /app/data/workflows は、管理用 API で保存したワークフローの置き場（compose で名前つきボリュームにする。
# ボリュームは、ここで付けた持ち主を引き継ぐ）
RUN useradd --uid 1000 --create-home app \
    && mkdir -p /app/data/stream-output /app/data/workflows \
    && chown -R app:app /app/data

ENV PATH="/app/waha-emulator/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    STREAM_ALLOWED_DIR="/app/data/stream-output"

USER app

EXPOSE 8080

# アクセスログは出さない。startsession のクエリ（authkey）がログに残るため
CMD ["uvicorn", "waha_emulator.main:app_factory", "--factory", \
     "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
