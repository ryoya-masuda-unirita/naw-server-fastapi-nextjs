FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /usr/local/bin/uv

# ファイルのテキストの取り出し（Apache Tika。移植元 `TikaService` の移植）のため、Tika の
# サーバー（jar）と JRE を、このコンテナの中に入れる。移植元は Tika をサーバー本体の
# プロセスの中で使う。Python 版は、同じコンテナの中で子プロセスとして起動し、localhost で
# 呼ぶ（別のサービスにしない）。jar はビルドのときに取得し、固定した SHA-512（公式の
# .sha512 と一致を確認済み）で検証する。実行時にはダウンロードしない
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
# バージョンをそのままイメージに焼き込む（コピーしないと uv sync がその場で
# 依存を解決し直し、ロックファイルの意味がなくなる）
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY app/ ./app/

# alembic.ini / alembic/ はマイグレーション実行（CI/CDの one-off task）に必要なため含める
COPY alembic.ini ./
COPY alembic/ ./alembic/

EXPOSE 8000

# --no-sync がないと uv run が起動時に依存を再解決し、--no-dev で除外したはずの
# 開発用パッケージ（ruff/mypy 等）まで実行時にダウンロードしてしまう
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
