---
name: naw-pr-workflow
description: Use when preparing a pull request for naw-server-fastapi-nextjs, including PR body drafting, review note creation, test result summarization, and Closes #XX handling.
---

# NAW PR Workflow

この skill は、このリポジトリで PR を作成するときに使う。

## PR 作成前チェック

- ベースブランチが `develop` か確認する
- 変更概要を 3 点以内で要約する
- テスト結果を記録する
- 実機またはコマンドベースの確認結果をまとめる
- `Closes #XX` を入れる
- PR 作成後は `.github/workflows/project-status-sync.yml` により対応 Issue が `Review` へ自動反映される前提で確認する
- `Closes #XX` により、PR マージ時に Issue がクローズされ GitHub Projects の `Done` へ自動反映される前提で確認する

## PR 本文の基本形

```markdown
## 概要
- 変更点

## テスト
- 実行コマンドと結果

## 動作確認
- 確認内容と結果

Closes #XX
```

## `code-review.md`

レビュー指摘の記録が必要なら `docs/issue-*/code-review.md` を作成し、以下を残す。

- 指摘内容
- 影響範囲
- 対応方針
- 再テスト結果

## 注意

- `08_動作確認.md` に未確認事項がある場合は、PR 本文でも隠さない
- テスト未実施なら理由を書く
