# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-429/` |
| 2 | 会話の本文・除外パスのテストを足す（実装前に失敗するもの） | `secuaigent-server-local/tests/` |
| 3 | 認証の除外パスを完全一致にする | `secuaigent-server-local/app/core/security.py` |
| 4 | 会話の本文をログに出さない | `secuaigent-server-local/app/services/`・`app/routers/messages.py`・`app/main.py` |
| 5 | README にログと除外パスの説明を書く | `secuaigent-server-local/README.md` |
| 6 | 動作確認と code-review の結果を記録 | `docs/issue-429/` |

注意: コミット 2 の時点では、テストが失敗する（実装前の確認のため）。PR 全体で通れば足りる。
