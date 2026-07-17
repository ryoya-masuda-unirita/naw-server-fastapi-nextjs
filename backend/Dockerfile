FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /usr/local/bin/uv

# uv.lock も併せてコピーし --frozen を付けることで、ロックファイルで固定した
# バージョンをそのままイメージに焼き込む（コピーしないと uv sync がその場で
# 依存を解決し直し、ロックファイルの意味がなくなる）
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY app/ ./app/

EXPOSE 8000

# --no-sync がないと uv run が起動時に依存を再解決し、--no-dev で除外したはずの
# 開発用パッケージ（ruff/mypy 等）まで実行時にダウンロードしてしまう
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
