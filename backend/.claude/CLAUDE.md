# backend — Claude 向けプロジェクト設定

## 移植元リポジトリ

Spring Boot 実装: `~/Documents/naw-server`

**このリポジトリは日々更新される**。実装前に必ず最新の Spring Boot 実装を確認してからポートすること。

---

## 技術スタック

| 種別 | 技術 |
|---|---|
| フレームワーク | FastAPI |
| 言語 | Python 3.12+ |
| ORM | SQLModel（SQLAlchemy async ベース） |
| DB | PostgreSQL（RLS によるテナント分離） |
| バリデーション | Pydantic v2（SQLModel に統合） |
| テスト | pytest + pytest-asyncio |

---

## Spring Boot → FastAPI 対応表

| Spring Boot | FastAPI |
|---|---|
| `@RestController` | `APIRouter`（`routers/xxx.py`） |
| `@Service` | `services/xxx_service.py` |
| `@Repository` / JPA Repository | `repositories/xxx_repository.py` |
| `@Entity` | SQLModel（`models/xxx.py`） |
| `@RequestBody` / `@RequestParam` | Pydantic モデル / Query params |
| `@Transactional` | SQLAlchemy `AsyncSession`（`async with session.begin()`） |
| `Page<T>` | `PagedResponse[T]`（共通スキーマ） |
| Spring Security / JWT | FastAPI Security / `Depends` |
| `TenantContext`（RLS） | FastAPI `Depends` でセッション開始時に注入 |
| `Specification` パターン | SQLAlchemy `where()` の動的組み立て |
| `application.yml` | `.env` + `pydantic-settings` |

---

## アーキテクチャ規約

### レイヤー責務

```
routers/      → HTTP ルーティング・リクエスト受け取り・レスポンス返却
services/     → ビジネスロジック。状態を持たない
repositories/ → DB アクセスのみ。SQLModel / SQLAlchemy クエリを書く
models/       → SQLModel テーブル定義（DB モデル ＝ Pydantic スキーマ）
schemas/      → リクエスト・レスポンス専用スキーマ（モデルと分ける場合）
core/         → 設定・DI・共通ユーティリティ
```

### ディレクトリ構造

```
app/
├── routers/
│   ├── assistant.py
│   ├── room.py
│   ├── user.py
│   └── ...
├── services/
│   ├── assistant_service.py
│   └── ...
├── repositories/
│   ├── assistant_repository.py
│   └── ...
├── models/
│   ├── assistant.py
│   └── ...
├── schemas/          # リクエスト・レスポンス専用スキーマ
│   └── ...
└── core/
    ├── config.py     # pydantic-settings による設定
    ├── database.py   # SQLAlchemy async エンジン・セッション
    ├── security.py   # JWT 検証
    └── tenant.py     # RLS テナント注入
```

### SQLModel のパターン

```python
# models/assistant.py
from sqlmodel import SQLModel, Field
import uuid

class Assistant(SQLModel, table=True):
    __tablename__ = "assistants"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    tenant_id: uuid.UUID
```

### RLS（テナント分離）のパターン

PostgreSQL の RLS をそのまま使用する。FastAPI の `Depends` でセッション開始時にテナント ID を設定する。

```python
# core/tenant.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

async def get_session_with_tenant(
    tenant_id: str,  # JWT から取得
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        text("SET app.tenant_id = :tid"), {"tid": tenant_id}
    )
    return session
```

### ページネーションレスポンスの形式

Spring Boot の `Page<T>` と同形式で返すこと（フロントエンドとの互換性のため）。

```python
# schemas/pagination.py
from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class PagedResponse(BaseModel, Generic[T]):
    content: list[T]
    totalElements: int
    number: int   # 0-indexed
    size: int
```

---

## 開発コマンド

```bash
# 開発サーバー起動
uvicorn app.main:app --reload

# テスト
pytest

# 型チェック
mypy app/

# Lint
ruff check app/
```

---

## ローカル開発環境のDB

プロジェクトルート（`naw-server-fastapi-nextjs/`）の `docker-compose.yml` で PostgreSQL を起動する。

```bash
docker compose up -d
```

```
コンテナ名: naw-fastapi-postgres
ホスト:     localhost
ポート:     5433
DB名:       postgres
ユーザー:   root
パスワード: root
```

起動後、Alembic でマイグレーションを実行する。

```bash
cd backend
alembic upgrade head
```

---

## コーディング規約

- PEP 8 準拠
- 型ヒントを必ず付ける（Python 3.12+ 構文: `list[str]`、`dict[str, int]` 等）
- `async/await` を使う（sync な DB アクセスは禁止）
- `Optional` は使わず `X | None` で書く
- コメントは「なぜそうしているか」を書く。コードをそのまま言葉にするコメントは書かない

---

## テスト

### テストフレームワーク

```python
import pytest
from httpx import AsyncClient
```

### テストの種類

| 種別 | 対象 | 方針 |
|---|---|---|
| Router テスト | `test_xxx_router.py` | `AsyncClient` でエンドポイントを叩く |
| Service テスト | `test_xxx_service.py` | Repository をモックして純粋なロジックをテスト |
| Repository テスト | `test_xxx_repository.py` | テスト用 DB に実際に接続してテスト |

### 命名規則

```python
# describe 相当のクラスで日本語グループ化
class TestAssistantRouter:
    class TestCreate:
        async def test_アシスタントを作成できること(self): ...
        async def test_名前が空だと作成できないこと(self): ...

# フィクスチャデータは FIXTURE_ プレフィックス
FIXTURE_ASSISTANT = {"name": "テストアシスタント", ...}
```
