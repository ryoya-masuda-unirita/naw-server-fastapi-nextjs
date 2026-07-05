---
name: naw-pr-workflow
description: Use when preparing a pull request for naw-server-fastapi-nextjs, including PR body drafting, review note creation, test result summarization, and Closes #XX handling.
---

# NAW PR Workflow

この skill は、このリポジトリで PR を作成するときに使う。

## PR 作成前チェック

- ベースブランチを確認する（下記「ベースブランチ」参照）
- 変更概要を 3 点以内で要約する
- テスト結果を記録する
- 実機またはコマンドベースの確認結果をまとめる
- `Closes #XX` を入れる
- PR 作成後は `.github/workflows/project-status-sync.yml` により対応 Issue が `Review` へ自動反映される前提で確認する
- `Closes #XX` により、PR マージ時に Issue がクローズされ GitHub Projects の `Done` へ自動反映される前提で確認する

## ベースブランチ

`gh pr create` のベースブランチは、そのブランチを切り出した元ブランチを指定する。

- `develop` から切ったブランチ → `--base develop`
- 別のフィーチャーブランチから切ったブランチ → `--base <元のフィーチャーブランチ名>`

## タイトルフォーマット

```
#{番号} issue-{番号} NAW-XXXX 変更概要（日本語）
```

- NAW チケットがない場合は `NAW-XXXX` を省略する
- 技術的な実装詳細ではなく、何を実現したかを書く
- 70文字以内

## PR 本文の基本形

```markdown
# 変更概要
- 変更点1
- 変更点2

# テスト結果

（テストコマンドの実際の出力結果を貼ること。生成・推測禁止）

# 動作確認

## Step N: {確認内容のタイトル}

（実際の操作結果。生成・推測禁止）

✅ {確認できた点}

Closes #XX
```

ドキュメントは `docs/issue-X/` または `docs/issue-X-NAW-XXXX/` に git 管理されているため、PR Description から参照してもよい。

## `code-review.md`

`/code-review` 実行後、結果を `docs/issue-X/code-review.md`（NAW チケットあり: `docs/issue-X-NAW-XXXX/code-review.md`）にまとめる。各指摘に対して対応した場合はその説明、対応しない場合はその理由を記載する。

```markdown
# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `path/to/file.py` | 〇〇の問題 | 対応済み |
| 2 | 🟡 注意 | `path/to/file.py` | 〇〇の懸念 | 対応しない |
| 3 | 🔵 提案 | `path/to/file.py` | 〇〇の改善案 | 対応済み |

## 詳細

### 1. 〇〇の問題（🔴 致命的）→ 対応済み

（何をどう修正したかを説明）

### 2. 〇〇の懸念（🟡 注意）→ 対応しない

（なぜ対応しないかの理由を説明）

### 3. 〇〇の改善案（🔵 提案）→ 対応済み

（何をどう修正したかを説明）
```

指摘への対応方針: 🔴 致命的は必ず修正、🟡 注意・🔵 提案は AI が判断する。

## 動作確認のスクリーンショット

ブラウザでの動作確認をPlaywright等で行った際は、スクリーンショットを `docs/issue-X/screenshots/`（NAWチケットあり: `docs/issue-X-NAW-XXXX/screenshots/`）に保存し、`08_動作確認.md` から `![説明](./screenshots/ファイル名.png)` の形式で参照する。

- PNGはgit差分圧縮が効かずリポジトリに残り続けるため、証跡として重要なステップに絞って数枚程度に留める
- 1枚あたり数十〜百KB程度であれば問題ない。多数の高解像度画像を毎回蓄積するような使い方はしない

## 注意

- `08_動作確認.md` に未確認事項がある場合は、PR 本文でも隠さない
- テスト未実施なら理由を書く
