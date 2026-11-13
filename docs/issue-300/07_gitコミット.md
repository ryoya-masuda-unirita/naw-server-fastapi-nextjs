# 07_gitコミット

ブランチ: `feature/issue-300`（`origin/develop` から作成）

コミットは次の単位に分けた（規約: `#300 issue-300 概要` + 4 スペース `- 詳細`。`Co-Authored-By` は付けない）。

| # | 内容 |
|---|---|
| 1 | docs/issue-300 の設計書（00〜08） |
| 2 | core: embedding・resource・vector・graphrag（ingestion・bootstrap）・media（PDF/Office）の移植とテスト、ワークスペースの依存 |
| 3 | embedding-adapter の移植とテスト |
| 4 | エミュレーター: 埋め込みアダプタのワークフロー（学習・削除・同期）、設定、Docker、テスト |
| 5 | README・CLAUDE.md・AGENTS.md の更新 |
| 6 | code-review の指摘への対応（`code-review.md`） |

実際のハッシュは `git log origin/develop..HEAD --oneline` を参照。
