# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `.github/workflows/project-status-sync.yml:16` | `github.token` は Projects v2 GraphQL API に必要な `project` スコープを持たないため、ワークフロー全体が失敗する | 対応済み |
| 2 | 🟡 注意 | `project_status_sync.sh:116,125` | `gh project item-list` の `--limit` 未指定でデフォルト上限 30 件が適用され、31 件目以降の Issue を検出できない | 対応済み |
| 3 | 🟡 注意 | `.github/workflows/project-status-sync.yml:20` | Draft PR の `opened` イベントでも `move-to-review` が実行され、Issue が「In Progress」から「Review」へ誤移動する | 対応済み |
| 4 | 🟡 注意 | `.github/workflows/project-status-sync.yml:9` | `edited` トリガーにより、マージ済み PR の説明を後から編集すると「Done」の Issue が「Review」へ戻る | 対応済み |
| 5 | 🔵 提案 | `backend/tests/integration/conftest.py:55` | `commit()` 成功後の `rollback()` は no-op であり、DELETE が取り消されるかのように誤読される | 対応済み |
| 6 | 🔵 提案 | `backend/tests/integration/test_auth.py:34` | `test_post_auth_logout` は DB を使わない Router テストで、CLAUDE.md では `unit/` に配置するよう定めている | 対応しない |

## 詳細

### 1. github.token が Projects v2 に書き込めない（🔴 致命的）→ 対応済み

`repository-projects: write` は Classic Projects (v1) REST API 向けの権限であり、`gh project item-edit` 等が使う Projects v2 GraphQL API（`updateProjectV2ItemFieldValue` 等）には `project` OAuth スコープが必須。`GITHUB_TOKEN` はこのスコープを取得できないため、ワークフロー実行時に "Resource not accessible by integration" エラーで全コマンドが失敗する。

`GH_TOKEN` を `${{ secrets.PROJECT_PAT }}` に変更し、`project` スコープを持つ PAT を利用するよう修正した。ユーザーは GitHub Secrets に `PROJECT_PAT` を登録する必要がある。

### 2. item-list の --limit 未指定（🟡 注意）→ 対応済み

`gh project item-list` のデフォルト上限は 30 件。プロジェクトに 31 件以上のアイテムがあると、対象 Issue が見つからず `gh project item-add` で重複登録しようとした後に失敗する。`--limit 200` を追加した。

### 3. Draft PR が move-to-review を誤トリガー（🟡 注意）→ 対応済み

`opened` イベントは Draft PR でも発火する。`move-to-review` の条件に `&& !github.event.pull_request.draft` を追加し、Draft PR ではスキップするよう修正した。

### 4. edited イベントで Done が Review に戻る（🟡 注意）→ 対応済み

マージ済み PR の説明を後から編集すると `edited` イベントが発火し `move-to-review` が実行される。`edited` をトリガーから除去した。PR タイトル・本文の再編集時に同期が走る必要性は低く、`opened`/`reopened`/`ready_for_review` のみで十分。

### 5. commit 後の rollback（🔵 提案）→ 対応済み

`await sess.commit()` でトランザクションがコミットされた後の `await sess.rollback()` は SQLAlchemy では空のトランザクションをロールバックする no-op。DELETE が取り消されると誤読されるため削除した。

### 6. test_post_auth_logout の配置（🔵 提案）→ 対応しない

このメソッドのみ `unit/` に移動すると、`client` fixture（`override_get_session` → `session` に依存）を unit/conftest に複製する必要があり、変更コストが高い。他の 7 テストは DB を使うため `integration/` が正しく、1 メソッドだけを分割する効果は薄い。現状維持とする。
