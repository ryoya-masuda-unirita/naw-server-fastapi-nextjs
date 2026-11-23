# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜02）を作成 | `docs/issue-427/` |
| 2 | 同じ値の行がページをまたぐテストを足す（実装前に失敗するもの） | `server/tests/integration/test_paging_tie_breaker.py` |
| 3 | 8 つの一覧の並び順の最後に一意キーを足す | `server/app/repositories/` |
| 4 | 並びが不定だった既存テストを、内容で行を探す形に直す | `server/tests/integration/test_feedback.py` |
| 5 | 詳細設計・動作確認・code-review の結果を記録 | `docs/issue-427/` |

注意: コミット 2 の時点では、テストが失敗する（実装前の確認のため）。PR 全体で通れば足りる。
