---
name: naw-pr-workflow
description: Use when preparing a pull request for naw-server-fastapi-nextjs, including PR body drafting, review note creation, test result summarization, and Closes #XX handling.
---

# NAW PR Workflow

この skill は、このリポジトリで PR を作成するときに使う。

## Codex での重要事項

Claude 側の `/code-review` 専用導線は Codex には存在しない。したがって Codex は、**PR 作成タスクを受けたら `gh pr create` で終了してはいけない**。必ず同じ作業の中で以下まで完了させること。

1. PR 作成
2. ベースブランチ差分でのコードレビュー実行
3. `docs/issue-*/code-review.md` の作成または更新
4. レビュー指摘があれば修正、再テスト、PR 更新

レビュー結果が「指摘なし」の場合も、`code-review.md` にその事実を残すこと。

## PR 作成前チェック

- ベースブランチを確認する（下記「ベースブランチ」参照）
- 変更概要を 3 点以内で要約する
- テスト結果を記録する
- 実機またはコマンドベースの確認結果をまとめる
- `code-review.md` の更新先（`docs/issue-*/code-review.md`）を確認する
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

Codex は PR 作成後、ベースブランチ差分に対して自分でコードレビューを実行し、結果を `docs/issue-X/code-review.md`（NAW チケットあり: `docs/issue-X-NAW-XXXX/code-review.md`）にまとめる。各指摘に対して対応した場合はその説明、対応しない場合はその理由を記載する。

### Codex のレビュー実行ルール

- `gh pr create` の直後にレビューへ進むこと。ユーザーが別途「レビューして」と言うのを待たない
- 差分は必ずベースブランチ基準で確認する
- まず次を実行してレビュー対象を確定する

```bash
bash .codex/skills/naw-pr-workflow/scripts/prepare_code_review.sh issue-45
bash .codex/skills/naw-pr-workflow/scripts/prepare_code_review.sh issue-45-NAW-1234
bash .codex/skills/naw-pr-workflow/scripts/prepare_code_review.sh issue-45 feature/issue-44
```

- 上記スクリプトの出力から `CODE_REVIEW_MD` と `MERGE_BASE` を取得し、`git diff <MERGE_BASE>` を読んでレビューする
- レビューは bugs / risks / regression / missing tests を優先して行う
- 指摘なしでも `code-review.md` を作成し、「指摘なし」と残す
- 🔴 致命的があれば、PR を出したまま放置せずその場で修正・再テスト・PR 更新まで進める
- `code-review.md` の作成・更新には `apply_patch` を使う

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

指摘がなかった場合:

```markdown
# code-review 結果

## 指摘一覧

指摘なし。

## 詳細

- ベースブランチ差分を確認し、修正が必要な指摘はありませんでした。
```

指摘への対応方針: 🔴 致命的は必ず修正、🟡 注意・🔵 提案は AI が判断する。

## Codex の実行手順

PR 作成タスクを受けたときの Codex の標準手順:

1. ベースブランチを確認して `gh pr create`
2. `prepare_code_review.sh` を実行して `CODE_REVIEW_MD` / `MERGE_BASE` を確定
3. `git diff <MERGE_BASE>` を読んでレビュー
4. `code-review.md` を作成または更新
5. 指摘があれば修正、再テスト
6. 必要なら PR 本文を更新

この 1〜6 をまとめて完了させる。レビューだけ別タスク扱いにしない。

## 動作確認のスクリーンショット

ブラウザでの動作確認をPlaywright等で行った際は、スクリーンショットを `docs/issue-X/screenshots/`（NAWチケットあり: `docs/issue-X-NAW-XXXX/screenshots/`）に保存し、`08_動作確認.md` から `![説明](./screenshots/ファイル名.png)` の形式で参照する。

- PNGはgit差分圧縮が効かずリポジトリに残り続けるため、証跡として重要なステップに絞って数枚程度に留める
- 1枚あたり数十〜百KB程度であれば問題ない。多数の高解像度画像を毎回蓄積するような使い方はしない

## 注意

- `08_動作確認.md` に未確認事項がある場合は、PR 本文でも隠さない
- テスト未実施なら理由を書く
- Codex は「PR を作ったら完了」と解釈しない。レビューと `code-review.md` 更新まで終えて初めて PR タスク完了とする
