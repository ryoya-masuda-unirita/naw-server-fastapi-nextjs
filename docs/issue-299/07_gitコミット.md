# 07_gitコミット

ブランチ: `feature/issue-299`（`origin/develop` から作成）。コミットメッセージは `#299 issue-299 概要` + 4 スペース `- 詳細`。

| # | コミット | 内容 |
|---|---|---|
| 1 | docs の作成 | `docs/issue-299/00〜07` |
| 2 | core の検索を移植 | `resource/`・`vector/`・`retrieval/` と core のテスト |
| 3 | 検索アダプタを移植 | `retrieval-adapter/` とテスト、ワークスペース・CI の設定 |
| 4 | エミュレーターに差し込み | `retrieval` の設定・ワークフロー・テスト・Docker・設定例 |
| 5 | README・動作確認・code-review | README、`08_動作確認.md`、`code-review.md` |

押し上げは `git push origin HEAD:feature/issue-299`。
