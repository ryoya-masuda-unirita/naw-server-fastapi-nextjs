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

## Command 的に使う補助スクリプト

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

## HITL

HITL 指定時は次で止まること。

1. `01_要件定義.md` と `02_基本設計.md` 完了後
2. `03_詳細設計.md` 〜 `05_テスト詳細設計.md` 完了後
3. 実装・テスト完了後、PR 作成前

`06_タスクリスト.md` は、タスク完了のたびに即時更新すること。

## 全自動

全自動指定時は、判断が分かれる点だけ確認し、それ以外は止まらず進める。

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
