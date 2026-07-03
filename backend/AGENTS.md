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

## テスト / HITL 補足

- HITL モードでは、バックエンド実装やテストを1まとまり終えるごとに `docs/issue-*/06_タスクリスト.md` を即時更新する
- 検証結果は `08_動作確認.md` に事実ベースで残す
