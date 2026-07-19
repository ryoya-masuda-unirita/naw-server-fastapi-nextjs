# backend — Codex 運用ガイド

このディレクトリ配下では、ルート `AGENTS.md` の指示に加えて以下を優先すること。

## 移植元

Spring Boot 実装: `~/Documents/secuaigent/server`

実装前に必ず最新状態を確認すること。
移植元の `git log` 確認や、対象 Controller/Service/Request/Response の読み込みなど、読み取り専用のリサーチがまとまった分量になりそうな場合も、Codex が必要な範囲を直接確認して実装方針へ反映する。対象が広すぎて判断が分かれる場合だけ、作業前に確認する。

## 技術スタック

- FastAPI
- Python 3.12+
- SQLModel / SQLAlchemy async
- PostgreSQL
- Pydantic v2
- pytest + pytest-asyncio

## Spring Bootからの移植における書き方の方針

コードの書き方（イディオム）はFastAPI/Pythonのベストプラクティスに従う。Javaのパターンをそのまま直訳しない。

ただし、Spring由来の設計上の規律で優れている部分（下記「レイヤー責務」「重要ルール」にあるControllerServiceRepositoryの責務分離、`service`が別`service`を呼ばない、DB操作を`repositories/`に集約する、等）はPythonでもそのまま維持する。移植元がJavaだからではなく、それ自体が優れた設計だから維持する。

例: バリデーションは`schemas/`のPydanticモデルに書く（ルーターには書かない）。単純な制約は`Field(min_length=..., max_length=...)`のように宣言的に書き、移植元Javaのような日本語カスタムエラーメッセージが必要な場合や単純な制約で表現できないロジック（空白のみ拒否等）のみ、Pydantic v2の`@field_validator` + `@classmethod`のデコレータ構文をモデルクラスの中に直接書く。関数をモジュールレベルに切り出して`field_validator(...)（func)`のように後から手動で登録する書き方はしない。複数のリクエストクラスで同じバリデーションを共有する場合は共通の基底クラスを継承させる。

判断に迷った場合は実装前に一言確認すること。

## レイヤー責務

```text
routers/      HTTP ルーティング
services/     ビジネスロジック
repositories/ DB アクセス
models/       SQLModel テーブル定義
schemas/      リクエスト・レスポンス専用スキーマ
core/         設定、DI、共通処理
```

### 重要ルール

- `router` と `service` は 1 対 1 で対応させる
- `service` から別の `service` を呼ばない
- 共通 DB 操作は `repositories/` に切り出す
- sync な DB アクセスは禁止
- 型ヒントは全関数・全メソッドの引数と戻り値に付ける
- `Optional` は使わず `X | None` を使う
- 移植元（Spring Boot）で `@JoinTable` のみで実体化されていない中間テーブルや、Liquibase changelogにしかなくJPA Entityが存在しないテーブルも、省略せず `models/` に `SQLModel(table=True)` として定義する。カラム構成は対応するLiquibase changelog（`~/Documents/secuaigent/server/src/main/resources/liquibase/changelog/`）で確認する
- N+1問題を発生させない: 一覧取得後に関連データを行数分の個別クエリで取得しない。`IN`句や`JOIN`で1クエリにまとめること
- 複数行のUPDATE/DELETEをPythonのループで1件ずつ発行しない。`delete()`文で条件に合う行を一括処理すること（`session.add()`のループはSQLAlchemyの`insertmanyvalues`により1回のINSERTにまとまるため問題ない）
  - 参考実装: `app/repositories/group_prompt_template_repository.py`

## 実装パターン

- Spring の `@RestController` 相当は `APIRouter`
- `@Service` 相当は `services/*_service.py`
- `@Repository` 相当は `repositories/*_repository.py`
- `Page<T>` 相当は `PagedResponse[T]`
- テナント分離は PostgreSQL の RLS を前提にする

### Spring Boot → FastAPI 対応表

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

### RLS（テナント分離）

PostgreSQL の RLS をそのまま使用する。FastAPI の `Depends` でセッション開始時にテナント ID を設定する。

```python
async def get_session_with_tenant(
    tenant_id: str,
    session: AsyncSession = Depends(get_session),
) -> AsyncSession:
    await session.execute(text("SET app.tenant_id = :tid"), {"tid": tenant_id})
    return session
```

### ページネーションレスポンス

Spring Boot の `Page<T>` と同形式で返すこと（フロントエンド互換性のため）。

```python
class PagedResponse(BaseModel, Generic[T]):
    content: list[T]
    totalElements: int
    number: int
    size: int
```

## 新規 Issue 対応開始時

新しいチケット・Issue に着手する前に、必ずルート `AGENTS.md` と `.codex/skills/naw-issue-workflow/SKILL.md` に従う。スクリプト未使用で手動開始する場合も、`develop` を最新化してからブランチを切ること。

```bash
git fetch
git checkout develop
git pull
git checkout -b feature/issue-X
git log origin/develop ^HEAD --oneline
```

- `develop` を最新化せずにブランチを切らない
- ブランチを切った後、`git log origin/develop ^HEAD --oneline` で develop との差分がないことを確認する

## 開発コマンド

```bash
uv run uvicorn app.main:app --reload --port 8001
pytest
mypy app/
ruff check app/
```

### Gitフックの初期設定（初回のみ）

`git commit`時にRuffのフォーマッター・リンターを自動適用するため、`pre-commit`フレームワークを使用する。クローン後に1回だけ実行する。

```bash
cd backend && uv sync
uv run pre-commit install
```

`git commit`のたびに`.pre-commit-config.yaml`で定義したRuffのフォーマット・自動修正（`backend/`配下のみ対象）が実行される。**修正が入った場合、そのコミットは一旦失敗する**（`pre-commit`フレームワークの標準動作）。ファイルは自動修正済みの状態になっているので、`git add`でステージし直してもう一度`git commit`すれば成功する（2回コミットする形になる）。開発中（保存のたび等）には走らないため、実装途中の未使用importがあっても妨げられない。

なお、以前使用していた`.githooks/pre-push`（`git config core.hooksPath .githooks`）は、amend後の内容が実際にはpushされないという致命的な欠陥が判明したため廃止した。過去にこの設定を行った環境では、以下で設定を解除すること。

```bash
git config --unset core.hooksPath
```

## ローカル DB

プロジェクトルートの `docker-compose.yml` で PostgreSQL を起動する。

```bash
docker compose up -d
cd backend
alembic upgrade head
```

接続情報:

- コンテナ名: `naw-fastapi-postgres`
- ホスト: `localhost`
- ポート: `5433`
- DB 名: `postgres`
- ユーザー: `root`
- パスワード: `root`

## シードデータ

動作確認に必要なデータは `backend/seed.sql` に定義してDBに格納する。既存データを使い回さず、そのIssue対応で新たに必要になったデータはIssue対応の中で `seed.sql` に追記する。

```bash
docker exec -i naw-fastapi-postgres psql -U root -d postgres < backend/seed.sql
```

- `ON CONFLICT DO NOTHING` 等で冪等に書く
- 追加内容は `03_詳細設計.md`（または `06_タスクリスト.md`）に明記する

## テスト / HITL 補足

- HITL モードでは、バックエンド実装やテストを1まとまり終えるごとに `docs/issue-*/06_タスクリスト.md` を即時更新する
- 検証結果は `08_動作確認.md` に事実ベースで残す

## コーディング規約

- PEP 8 準拠
- 型ヒントをすべての関数・メソッドの引数と戻り値に必ず付ける（Python 3.12+ 構文: `list[str]`、`dict[str, int]` 等）
- `async/await` を使う（sync な DB アクセスは禁止）
- `Optional` は使わず `X | None` で書く
- コメントは「なぜそうしているか」を書く。コードをそのまま言葉にするコメントは書かない

### docstring

Google スタイルで書く。引数・戻り値・例外がある関数には必ず記載すること。

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

## テスト

```python
import pytest
from httpx import AsyncClient
```

```text
tests/
├── unit/          # DB 不要。1つの関数・メソッドを単独で検証するテスト
└── integration/   # DB 接続が必要なテスト
```

- unit: 外部依存なし。Router テスト（`ASGITransport` 経由）、Service テスト（Repository をモック）など
- integration: 実際の DB に接続して制約・CASCADE・データ整合性を確認する
- クラス名は英語（`TestAssistantRouter`, `TestCreate` など）
- テストメソッド名は英語（`test_insert_tenant`, `test_default_values` など）
- テストの意図は日本語 docstring に書く
