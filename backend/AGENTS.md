# backend — Codex 運用ガイド

このディレクトリ配下では、ルート `AGENTS.md` の指示に加えて以下を優先すること。

## 移植元

Spring Boot 実装: `~/Documents/naw-server`

実装前に必ず最新状態を確認すること。

## 技術スタック

- FastAPI
- Python 3.12+
- SQLModel / SQLAlchemy async
- PostgreSQL
- Pydantic v2
- pytest + pytest-asyncio

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
- 移植元（Spring Boot）で `@JoinTable` のみで実体化されていない中間テーブルや、Liquibase changelogにしかなくJPA Entityが存在しないテーブルも、省略せず `models/` に `SQLModel(table=True)` として定義する。カラム構成は対応するLiquibase changelog（`~/Documents/naw-server/src/main/resources/liquibase/changelog/`）で確認する

## 実装パターン

- Spring の `@RestController` 相当は `APIRouter`
- `@Service` 相当は `services/*_service.py`
- `@Repository` 相当は `repositories/*_repository.py`
- `Page<T>` 相当は `PagedResponse[T]`
- テナント分離は PostgreSQL の RLS を前提にする

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
