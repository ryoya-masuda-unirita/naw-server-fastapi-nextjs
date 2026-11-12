# 07_gitコミット

## server-local の分（1 本目の PR）

### コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを追加 | `docs/issue-311/00`〜`07` |
| 2 | アプリ本体とマイグレーションに docstring を付ける | `server-local/app/**`、`server-local/alembic/**` |
| 3 | テストに docstring を付ける | `server-local/tests/**` |
| 4 | ruff で docstring を強制し CI を追加 | `server-local/pyproject.toml`、`.github/workflows/server-local-tests.yml` |
| 5 | 動作確認を記録 | `docs/issue-311/06`・`08` |

### 各コミットメッセージ案

```
#311 issue-311 server-local の docstring 対応の設計ドキュメントを追加
    - docs/issue-311 に 00〜07 を作成（server-local の分であることを明記）
```

```
#311 issue-311 server-local のアプリ本体とマイグレーションに NumPy 形式の docstring を付ける
    - すべての関数・メソッド・クラス（private・ネストした関数・__init__ を含む）に日本語の docstring を追加
    - 既存の docstring に Parameters・Returns・Raises の節を追記
```

```
#311 issue-311 server-local のテストに docstring を付ける
    - テスト関数は日本語 1 行、fixture・ヘルパー・フェイクは NumPy 形式
    - 複数行だったテストの docstring 2 件を 1 行にし、補足はコメントに移動
```

```
#311 issue-311 server-local の ruff で docstring を強制し CI を追加
    - pydocstyle（numpy 規約）と D101・D102・D103・D105・D106・D107・D417 を有効化
    - server-local 用のテスト・ruff の CI ワークフローを新設
```

```
#311 issue-311 server-local の分の動作確認を記録
    - 08_動作確認.md に pytest・ruff・pre-commit の結果を記録
```
