# 07_gitコミット

## コミット分割案

### コミット1: プロジェクト設定ファイル

```
#3 FastAPI バックエンドのプロジェクト設定ファイルを追加
    - pyproject.toml を作成（依存パッケージ定義）
    - .env.example を作成
    - Dockerfile を作成
```

### コミット2: アプリケーションの骨格

```
#3 FastAPI アプリケーションの骨格を作成
    - ディレクトリ構造を作成（routers / services / repositories / models / schemas / core）
    - app/core/config.py を作成（pydantic-settings による環境変数管理）
    - app/routers/health.py を作成（GET /health エンドポイント）
    - app/main.py を作成（FastAPI アプリのエントリーポイント）
```

### コミット3: テスト

```
#3 ヘルスチェックエンドポイントのテストを追加
    - tests/test_health.py を作成
```
