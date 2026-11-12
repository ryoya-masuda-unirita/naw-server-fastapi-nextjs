# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント一式（00〜07） | `docs/issue-210/` |
| 2 | プロジェクト雛形・共通基盤（設定・DB・認証・例外・JSON 補助）・モデル・マイグレーション | `server-local/pyproject.toml`, `server-local/uv.lock`, `server-local/app/core/`, `server-local/app/models/`, `server-local/alembic*` |
| 3 | 外部クライアントと各 API（hello / libraries / messages / indexes）・SSE・定期処理 | `server-local/app/` |
| 4 | 自動テスト | `server-local/tests/` |
| 5 | Docker・README・pre-commit | `server-local/Dockerfile`, `server-local/docker-compose.yml`, `server-local/README.md`, `.pre-commit-config.yaml` |
| 6 | 動作確認結果 | `docs/issue-210/06_タスクリスト.md`, `docs/issue-210/08_動作確認.md` |
| 7 | code-review 結果と指摘対応 | `docs/issue-210/code-review.md` ほか |

## 各コミットメッセージ案

```
#210 issue-210 server-local 移植の設計ドキュメントを作成
    - 00〜07 を作成
    - 02 に移植元エンドポイント一覧と移植先の対応表を記載
```

```
#210 issue-210 server-local の共通基盤とDBモデルを追加
    - uv プロジェクトと設定・DB・認証ミドルウェア・例外ハンドラーを追加
    - Liquibase 定義に揃えた SQLModel モデルと Alembic 初期マイグレーションを追加
```

```
#210 issue-210 server-local のAPIとWaha!/NAW連携を移植
    - hello / libraries / messages / admin indexes の15エンドポイントを移植
    - NAW 互換 SSE と旧形式 SSE、ストリームファイル追従、定期削除を移植
```

```
#210 issue-210 server-local の自動テストを追加
    - 外部連携をモックしたルーター・サービス・クライアント・マイグレーションのテストを追加
```

```
#210 issue-210 server-local のDocker構成とREADMEを追加
    - Dockerfile・docker-compose.yml・.env.example・README を追加
    - pre-commit に server-local 向け ruff を追加
```

```
#210 issue-210 動作確認結果を記録
    - docker build とコンテナ起動後の curl 結果を 08 に記録
```
