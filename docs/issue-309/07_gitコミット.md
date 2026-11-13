# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象 |
|---|---|---|
| 1 | 認証の groups・shares の包み・ユーザー一覧のページ番号 | `schemas/auth.py`・`services/auth_service.py`・`routers/auth.py`・`routers/shares.py`・`services/user_service.py` ほか・テスト |
| 2 | メッセージ一覧のモデル・includeHistory とアシスタントの項目 | `schemas/message.py`・`schemas/assistant.py`・各リポジトリ・サービス・テスト |
| 3 | フィードバックの responded・indexId とファイルの status | `schemas/feedback.py`・`schemas/file.py`・`repositories/file_repository.py`・テスト |
| 4 | ログインキーをサーバーで発行しハッシュだけを保存する | `core/login_key.py`・`models/user.py`・`alembic/versions/024_*`・`schemas/user.py`・CSV 取り込み・テスト |
| 5 | docstring の NumPy 形式化と追加 | 触ったファイルすべて |
| 6 | docs | `docs/issue-309/` |

## 各コミットメッセージ

実際のメッセージは `git log` を参照（`#309 issue-309 概要` + 4 スペースの `- 詳細`、トレーラーなし）。
