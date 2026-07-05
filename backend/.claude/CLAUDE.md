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

### routers と services の対応規則

**router と service は 1 対 1 で対応させること。**

```
routers/users.py   ↔  services/user_service.py
routers/auth.py    ↔  services/auth_service.py
```

- 複数の router から共通で使う DB 操作は `repositories/` に切り出す
- 複数の router から共通で使う純粋な計算ロジック（ハッシュ・トークン生成等）は `core/` に置く
- `xxx_service.py` が別の `yyy_service.py` を呼ぶ構造は禁止

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

### 中間テーブル・Entity化されていないテーブルも必ずDBモデル化する

移植元（Spring Boot）では、中間テーブル（`@JoinTable`のみで定義されるM2M関連）や、Liquibaseのchangelogにしか定義がなくJPA Entityクラスが存在しないテーブルが存在する。

FastAPI側では、こうしたテーブルも省略せず、すべて `SQLModel(table=True)` のモデルクラスとして `models/` 配下に定義すること。

- 追加カラムを持つ中間テーブル（例: グループ所属ユーザーの管理者フラグ等）はもちろん、追加カラムのない単純なM2M中間テーブルも、SQLModelには「Entityなしで暗黙的にJoinTableを扱う」というSpring同等の省略記法がないため、明示的なモデルクラスとして定義する
- 移植対象のテーブルにSpring側のEntityクラスが存在しない場合でも、対応するLiquibaseのchangelog（`~/Documents/naw-server/src/main/resources/liquibase/changelog/`）を確認し、カラム構成を正しく再現したモデルを作成すること

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

## Human in the Loop（HITL）モード

HITL 方式で進める場合、タスクを完了するたびに **その場で** `06_タスクリスト.md` の該当項目を `- [x]` にチェックすること。まとめてチェックするのは禁止。

---

## 新規 Issue 対応開始時の手順

新しいチケット・Issue に着手する前に、必ず以下の手順で `develop` を最新化してからブランチを切ること。

```bash
git fetch
git checkout develop
git pull          # または git merge origin/develop
git checkout -b feature/issue-X
```

- `develop` を最新化せずにブランチを切ると、マージ済みの実装が取り込まれず、依存する機能が欠けた状態で開発することになる
- ブランチを切った後、`git log origin/develop ^HEAD --oneline` で develop との差分がないことを確認すること

---

## 開発コマンド

```bash
# 開発サーバー起動
uvicorn app.main:app --reload --port 8001

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

### シードデータ

動作確認（ブラウザ操作・API直叩き）に必要なデータは `backend/seed.sql` に定義してDBに格納する。既存データを使い回すのではなく、そのチケット・Issue対応で新たに必要になったデータ（新しいロールのユーザー、複数人操作の検証用ユーザー等）は該当Issue対応の中で `seed.sql` に追記すること。

```bash
docker exec -i naw-fastapi-postgres psql -U root -d postgres < backend/seed.sql
```

- 既存データを壊さないよう `ON CONFLICT DO NOTHING` 等で冪等に書く
- 追加したシードデータは `03_詳細設計.md`（または `06_タスクリスト.md`）に変更内容を明記する

---

## コーディング規約

- PEP 8 準拠
- 型ヒントを**すべての関数・メソッドの引数と戻り値に必ず付ける**（Python 3.12+ 構文: `list[str]`、`dict[str, int]` 等）
- `async/await` を使う（sync な DB アクセスは禁止）
- `Optional` は使わず `X | None` で書く
- コメントは「なぜそうしているか」を書く。コードをそのまま言葉にするコメントは書かない

### docstring

**Google スタイル**で書く。引数・戻り値・例外がある関数には必ず記載すること。

```python
def example(name: str, count: int) -> list[str]:
    """概要を1行で書く。

    Args:
        name: 名前の説明。
        count: 件数の説明。

    Returns:
        文字列のリスト。

    Raises:
        ValueError: count が負の場合。
    """
```

- 概要行は動詞で始める（「〜を取得する」「〜を検証する」など）
- 引数・戻り値がない場合は該当セクションを省略してよい
- テストメソッドには引数・戻り値セクション不要（日本語 docstring 1行のみ）

---

## テスト

### テストフレームワーク

```python
import pytest
from httpx import AsyncClient
```

### ディレクトリ構成

```
tests/
├── unit/          # DB 不要。1 つの関数・メソッドを単独で検証するテスト
└── integration/   # DB 接続が必要なテスト
    └── conftest.py  # alembic upgrade head + TRUNCATE + engine/session fixture
```

- **unit**: 外部依存なし。Router テスト（`ASGITransport` 経由）、Service テスト（Repository をモック）など
- **integration**: 実際の DB に接続して制約・CASCADE・データ整合性を確認するテスト

### テストの種類

| 種別 | ディレクトリ | 方針 |
|---|---|---|
| Router テスト | `unit/` | `AsyncClient` + `ASGITransport` でエンドポイントを叩く（DB 不要） |
| Service テスト | `unit/` | Repository をモックして純粋なロジックをテスト |
| Model/Repository テスト | `integration/` | テスト用 DB に実際に接続してテスト |

### 命名規則

- クラス名: 英語（`TestAssistantRouter`, `TestCreate` など）
- テストメソッド名: **英語**（`test_insert_tenant`, `test_default_values` など）
- テストの意図は**日本語 docstring** に書く

```python
class TestAssistantRouter:
    class TestCreate:
        async def test_insert_assistant(self, session):
            """アシスタントを作成できること"""
            ...

        async def test_name_empty_raises_error(self, session):
            """名前が空だと作成できないこと"""
            ...
```
