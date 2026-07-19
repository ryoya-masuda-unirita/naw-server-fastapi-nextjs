---
name: naw-frontend-issue-workflow
description: Use when working on a frontend porting GitHub Issue (Angular secuaigent/client → React frontend/) in this repository, including issue start, branch selection, docs/issue-* generation, HITL checkpoints, or full-auto implementation flow for naw-server-fastapi-nextjs.
---

# NAW Frontend Issue Workflow

この skill は、このリポジトリで**フロントエンド移植**（Angular `secuaigent/client` → React `frontend/`）のIssue対応を進めるときに使う。

バックエンド（Spring Boot `naw-server` → FastAPI `backend/`）のIssue対応は [naw-issue-workflow](../naw-issue-workflow/SKILL.md) を使う。ブランチ命名・ドキュメント構成・承認フロー・コミット規約は共通のためそちらを踏襲し、本skillでは**移植元・移植先・調査エージェント・動作確認方法が異なる点のみ**を上書きする。

## 使う場面

- 新しいフロントエンド移植Issueに着手する
- `docs/issue-*` 一式を作る
- HITL で段階承認しながら進める
- 全自動で設計から実装まで進める

## naw-issue-workflow との違い

| 項目 | naw-issue-workflow（バックエンド） | naw-frontend-issue-workflow（本skill） |
|---|---|---|
| 移植元 | `~/Documents/secuaigent/server`（Spring Boot） | `~/Documents/secuaigent/client`（Angular） |
| 移植先 | `backend/`（FastAPI） | `frontend/`（React） |
| 調査エージェント | `naw-explore` | `naw-frontend-explore` |
| Issueラベル | なし | 必ず `frontend-port` を付与する |
| 自動テスト | `pytest` | `npm run test`（Vitest）、`npm run lint`、`npm run type-check` |
| 動作確認 | サーバー起動 + API/ブラウザ操作 | `npm run dev`（`http://localhost:5173`）を起動し、実際に画面を操作して確認する |
| デザイン規約 | なし | `frontend/.claude/CLAUDE.md` の Angular→React 対応表・デザイン移行方針に必ず従う |

それ以外（ブランチ命名規則、ドキュメント構成、承認フロー、コミット規約、PRフォーマット）は `naw-issue-workflow` と完全に共通。

## 最初の流れ

1. 参照リポジトリ（`secuaigent/client`）を確認する
2. `gh pr list` で依存 PR の有無を確認する
3. `develop` を最新化する
4. 適切なブランチを切る
5. 作成したブランチを対応 Issue に紐づける
6. Issue を GitHub Projects の `In Progress` に移動する
7. `docs/issue-*` を作成する

この 3〜6 は、[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じスクリプトで自動化する（後述）。

### 参照リポジトリ調査はサブエージェントに委譲する

「1. 参照リポジトリを確認する」（`secuaigent/client` の最新画面・コンポーネント実装の読み込み、対応するReact側実装の有無確認、既存Issueとの突き合わせ等）は読み取り専用のリサーチであり、メインの会話コンテキストを圧迫しやすい。原則として `Agent(subagent_type: naw-frontend-explore)` に委譲すること（バックエンド用の `naw-explore` ではなく、フロントエンド移植前提を組み込んだ `naw-frontend-explore` を使う）。

- プロンプトには、対象の移植元ファイルパス（分かっていれば、Angular側の `*.component.ts`）、確認したい範囲、返してほしい情報（対象画面・コンポーネントの仕様、参照元ファイルパス、React側の対応実装有無、依存するバックエンドAPIの実装状況）を自己完結で書く
- `naw-frontend-explore` は読み取り専用のため、`gh issue create` 等の書き込み操作は必ずメインの会話側で実行する
- 対象がすでに明確（ユーザーが Issue 本文で移植元ファイルを指定済み等）で調査の必要が薄い場合は、委譲せず直接読んでよい

## Issue 起票手順

Issue 起票は必ず以下の手順を順番に行う（[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じだが、**Step 1 で `frontend-port` ラベルを必ず付与する**点が異なる）。

```bash
# Step 1: Issue 作成（frontend-port ラベルを必ず付与する。番号未確定のため、この時点では "#{番号}" を付けずに作成する）
gh issue create --title "issue-{仮} 変更概要" --label "frontend-port" --body "..."
# → 返ってきた URL から番号を取得する（例: .../issues/65 → 65）

# Step 1.5: 確定した番号でタイトルを付け直す（ここを忘れると "#{番号}" が欠けたまま残る）
gh issue edit {番号} --title "#{番号} issue-{番号} 変更概要"

# Step 2: プロジェクトボードに追加（Todo 状態で登録される）
gh project item-add 3 --owner ryoya-masuda-unirita \
  --url https://github.com/ryoya-masuda-unirita/naw-server-fastapi-nextjs/issues/{番号}

# Step 2.5: プロジェクトボードに追加できたか確認する（失敗を静かに見過ごさない）
gh issue view {番号} --json projectItems --jq '.projectItems | length'
# 0 の場合は Step 2 が失敗しているので、原因を確認してから再実行する

# Step 3: Issue 開始スクリプトで最新化・ブランチ作成・linked branch 反映・In Progress 移動まで自動化
bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}

# Step 4: docs ディレクトリと 00_チケット内容.md を作成してコミット
bash .claude/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-{番号}
# 00_チケット内容.md を作成（テンプレート参照）
git add docs/ && git commit -m "#{番号} issue-{番号} 00_チケット内容.md を作成"
git push -u origin feature/issue-{番号}
```

- プロジェクト番号: `3`
- オーナー: `ryoya-masuda-unirita`
- **`frontend-port` ラベルの付与を省略しないこと**。このラベルが、バックエンド用ループ（`naw-issue-loop`）とフロントエンド用ループ（`naw-frontend-issue-loop`）が同じプロジェクトボード上のIssueを取り違えないための唯一の区別手段になっている
- ブランチ・ドキュメントの命名は `issue-{番号}` のみを使う（フロントエンド移植にはNAWチケット番号が対応しないため、`NAW-XXXX` 付与は基本的に発生しない想定。もし対応するNAWチケットがあれば `naw-issue-workflow` と同様に `issue-{番号}-NAW-XXXX` 形式を使ってよい）
- **Step 1 で作成した時点のタイトルには Issue 番号がまだ入らない。Step 1.5 でのタイトル付け直しと Step 2.5 でのプロジェクト追加確認を省略しないこと**

### Issue本文のフォーマット

```markdown
## 概要
〇〇画面（Angular）を React に移植する。

## 参照
- 移植元（フロントエンド）: `~/Documents/secuaigent/client/src/app/...`
- 移植先: `frontend/src/...`
- 依存するバックエンドAPI: `GET /api/...`（backend側の実装状況を明記）
```

## ブランチ規約

```text
feature/issue-X
```

- `main` から直接切らない
- 必ず最新化した `develop` または依存ブランチから切る
- 依存 PR がある場合は、その依存ブランチから切る
- ブランチ作成後は対応 Issue の Development / linked branch として紐づける

## ドキュメント作成

[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じ構成・同じテンプレートを使う。

- `00_チケット内容.md`
- `01_要件定義.md`
- `02_基本設計.md`
- `03_詳細設計.md`
- `04_テスト設計.md`
- `05_テスト詳細設計.md`
- `06_タスクリスト.md`
- `07_gitコミット.md`
- `08_動作確認.md`

テンプレートと記載ルールは [naw-issue-workflow/references/doc-templates.md](../naw-issue-workflow/references/doc-templates.md) を読むこと（フロントエンド固有の追記は以下）。

- `02_基本設計.md` の「移植方針」には、`frontend/.claude/CLAUDE.md` の Angular→React 対応表（NgRx signalStore → TanStack Query/Zustand 等）に沿った変換方針を明記する
- `03_詳細設計.md` には、参照する Angular テンプレート（`*.component.html`）・移行先の React コンポーネント・使用する Tailwind クラス（`styles.css` のカスタムカラーの移行有無）を具体化する
- `04_テスト設計.md` は Vitest + React Testing Library を前提にする

## 承認フロー

[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じ2段階承認に従う。

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

各チェックリスト項目を実行する前に必ずユーザーの承認を得ること。

```
【次のタスク】
- 何をやるか: （具体的な変更内容）
- なぜやるか: （目的・理由）
- 期待結果: （実行後に何が変わるか）

進めてよいですか？
```

- 承認後に実行し、完了後に `06_タスクリスト.md` の該当項目を即時 `- [x]` にチェックする（まとめてチェックするのは禁止）
- **コミット・プッシュはどちらもユーザーの承認を得た後にのみ行う。**

### 全自動

第2承認で `全自動` が選択された場合のみ、実装フェーズ（コードの変更・生成）以降を、ユーザーに一度も操作させずに以下のサイクルで完遂する。

1. 実装（`06_タスクリスト.md` のタスクを順番に実行）
2. 自動テスト実行（`npm run test`・`npm run lint`・`npm run type-check`）
3. 動作確認（`npm run dev` の起動手順をユーザーに案内し、`http://localhost:5173` での操作結果を受け取る。もしくはPlaywright等で自動操作しスクリーンショットを取得する）
4. PR 作成
5. `/code-review` の実行
6. `code-review.md` の作成（[naw-pr-workflow](../naw-pr-workflow/SKILL.md) のフォーマットに従う）
7. 指摘修正 → 再テスト → 再動作確認 → PR 修正

code-review 指摘への対応: 🔴 致命的は必ず修正、🟡 注意・🔵 提案は AI が判断する。

## Command 的に使う補助スクリプト

[naw-issue-workflow](../naw-issue-workflow/SKILL.md) のスクリプトをそのまま流用する（フロントエンド専用のスクリプトは持たない。ブランチ作成・ドキュメント雛形生成・プロジェクトステータス同期のロジックはバックエンド/フロントエンドで違いがないため）。

```bash
bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-12
bash .claude/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-12
```

## PR / Projects 自動反映

- PR 作成後は `.github/workflows/project-status-sync.yml` により、`Closes #XX` を含む PR の対応 Issue を `Review` へ自動更新する
- PR が merge されたら、同 workflow により対応 Issue を `Done` へ自動更新する
- Claude は PR 本文に必ず `Closes #XX` を入れ、自動反映の前提を満たすこと

## コミット規約

[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じ。Conventional Commits は使わない。

```text
#11 issue-11 変更概要
    - 変更詳細
```
