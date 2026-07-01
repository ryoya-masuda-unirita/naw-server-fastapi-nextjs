---
name: naw-issue-workflow
description: Use when working on a GitHub Issue in this repository, including issue start, branch selection, docs/issue-* generation, HITL checkpoints, or full-auto implementation flow for naw-server-fastapi-nextjs.
---

# NAW Issue Workflow

この skill は、このリポジトリの Issue 対応を進めるときに使う。

## 使う場面

- 新しい Issue に着手する
- `docs/issue-*` 一式を作る
- HITL で段階承認しながら進める
- 全自動で設計から実装まで進める

## 最初の流れ

1. 参照リポジトリを確認する
2. `gh pr list` で依存 PR の有無を確認する
3. `develop` を最新化する
4. 適切なブランチを切る
5. 作成したブランチを対応 Issue に紐づける
6. Issue を GitHub Projects の `In Progress` に移動する
7. `docs/issue-*` を作成する

この 3〜6 は、原則として `start_issue.sh` を使って自動化する。

移植元:

- バックエンド: `~/Documents/naw-server`
- フロントエンド: `~/Documents/secuaigent-client`

## ブランチ規約

```text
feature/issue-X
feature/issue-X-NAW-XXXX
```

- `main` から直接切らない
- 必ず最新化した `develop` または依存ブランチから切る
- 依存 PR がある場合は、その依存ブランチから切る
- ブランチ作成後は対応 Issue の Development / linked branch として紐づける

## ドキュメント作成

必要ファイル:

- `00_チケット内容.md`
- `01_要件定義.md`
- `02_基本設計.md`
- `03_詳細設計.md`
- `04_テスト設計.md`
- `05_テスト詳細設計.md`
- `06_タスクリスト.md`
- `07_gitコミット.md`
- `08_動作確認.md`

テンプレートと記載ルールは [references/doc-templates.md](references/doc-templates.md) を読むこと。

## 承認フロー

Issue 対応は、デフォルトで以下の承認フローに従う。

### 第1承認: 設計承認

- `01_要件定義.md` と `02_基本設計.md` を作成する
- 不明点があればここで解消する
- 完了後は必ず停止し、ユーザー承認を得る
- 承認前に `03_詳細設計.md` 以降へ進まない

### 第2承認: 実装方式の選択

- 第1承認後に `03_詳細設計.md` 〜 `07_gitコミット.md` を作成する
- 必要に応じてドキュメントをコミット・プッシュする
- 完了後は必ず停止し、`Human in the Loop` または `全自動` のどちらで進めるかを確認する
- 選択を得る前に、実装コードの変更・生成へ進まない

### Human in the Loop

- 各実装タスクの実行前に都度承認を得る
- 実行後は `06_タスクリスト.md` を即時更新する
- コミットはタスク完了後に行う。**プッシュはユーザーの承認を得た後にのみ行う。**

### 全自動

- 第2承認で `全自動` が選択された場合のみ、実装フェーズ以降を止まらず進める
- 調査・実装・テスト・動作確認・PR・レビュー対応まで継続して進める

## Command 的に使う補助スクリプト

Issue 開始時は次を優先して使う。

```bash
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-12
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-12-NAW-1234
```

このスクリプトは以下を行う。

- `develop` を最新化する
- `feature/issue-*` ブランチを作成して checkout する
- GitHub Issue に linked branch を反映する
- GitHub Projects のステータスを `In Progress` に更新する

`docs/issue-*` の雛形だけ先に作るときは次を使う。

```bash
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-12
```

NAW チケット付き:

```bash
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-12-NAW-1234
```

このスクリプトは以下を行う。

- `docs/<issue-name>/` を作成
- `00`〜`08` の markdown ファイルを作成
- `00_チケット内容.md` と `06_タスクリスト.md` に最低限の雛形を入れる

## PR / Projects 自動反映

- PR 作成後は `.github/workflows/project-status-sync.yml` により、`Closes #XX` を含む PR の対応 Issue を `Review` へ自動更新する
- PR が merge されたら、同 workflow により対応 Issue を `Done` へ自動更新する
- Codex は PR 本文に必ず `Closes #XX` を入れ、自動反映の前提を満たすこと

## HITL

HITL 指定時は次で止まること。

1. `01_要件定義.md` と `02_基本設計.md` 完了後
2. `03_詳細設計.md` 〜 `05_テスト詳細設計.md` 完了後
3. 実装・テスト完了後、PR 作成前

`06_タスクリスト.md` は、タスク完了のたびに即時更新すること。

## 全自動

全自動指定時は、第2承認で `全自動` が選択された後に、判断が分かれる点だけ確認し、それ以外は止まらず進める。

1. 調査
2. ドキュメント作成
3. 実装
4. テスト
5. `08_動作確認.md` 記録
6. PR 作成

## コミット規約

Conventional Commits は使わない。

```text
#11 issue-11 変更概要
    - 変更詳細
```

NAW あり:

```text
#11 issue-11 NAW-1234 変更概要
    - 変更詳細
```
