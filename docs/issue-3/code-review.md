# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/core/config.py` | `Settings()` をモジュール直下で実体化しており、env vars なしで import するだけで `ValidationError` が発生する | 対応済み |
| 2 | 🟡 注意 | `backend/tests/test_health.py` | `@pytest.mark.asyncio` が未付与 | 対応済み |
| 3 | 🔵 提案 | `backend/tests/test_health.py` | `import pytest` が未使用 | 対応済み（実質解消） |
| 4 | 🔵 提案 | `backend/pyproject.toml` | `httpx` が prod 依存に含まれているがテスト専用ライブラリ | 対応済み |
| 5 | 🔵 提案 | `backend/Dockerfile` | `uv:latest` でビルド再現性がない | 対応済み |

## 詳細

### 1. `Settings()` モジュール直下での実体化（🔴 致命的）→ 対応済み

**問題**: `config.py` がモジュール直下で `settings = Settings()` を実行していた。env vars（`DATABASE_URL`, `SECRET_KEY`）がない状態で `from app.core.config import settings` するだけで `ValidationError` が送出される。pytest 収集時（import 時）に必ず失敗するため、テスト環境でも本番でも問題になる。

**対応**: `@lru_cache` 付きの `get_settings()` 関数に変更。呼び出し時に初めて実体化されるため、env vars が不要なテスト対象では `ValidationError` が発生しない。

```python
@lru_cache
def get_settings() -> Settings:
    return Settings()
```

---

### 2. `@pytest.mark.asyncio` 未付与（🟡 注意）→ 対応済み

**問題**: `asyncio_mode = "auto"` があれば動作はするが、明示的なデコレータがないとバージョン間の挙動差に依存する。`pytest-asyncio` のバージョンによっては警告またはエラーになる。

**対応**: テストメソッドに `@pytest.mark.asyncio` を追加。

```python
@pytest.mark.asyncio
async def test_ヘルスチェックが正常に返ること(self):
```

---

### 3. `import pytest` が未使用（🔵 提案）→ 対応済み（実質解消）

**問題**: `import pytest` が宣言されているがコード中で参照されていなかった。

**対応**: 指摘 #2 で `@pytest.mark.asyncio` を追加したことで `pytest` を使用するコードが生まれ、未使用状態が解消された。import を削除するのではなく、デコレータのために活用する形に変更。

---

### 4. `httpx` が prod 依存（🔵 提案）→ 対応済み

**問題**: `httpx` は `AsyncClient` を使ったテスト専用ライブラリであり、本番コンテナに含める必要がない。`pyproject.toml` の `[project] dependencies` に含まれていた。

**対応**: `[dependency-groups] dev` に移動。Docker ビルド時に `uv sync --no-dev` を実行しているため、本番イメージには含まれなくなった。

---

### 5. `uv:latest` でビルド再現性なし（🔵 提案）→ 対応済み

**問題**: `COPY --from=ghcr.io/astral-sh/uv:latest` では、ビルドタイミングによって取得される uv のバージョンが変わりビルド結果が変わる恐れがある。

**対応**: `uv:0.11.25` にバージョンを固定。
