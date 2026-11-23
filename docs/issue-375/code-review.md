# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `frontend/src/components/features/admin/training-data/training-data-edit-modal.tsx` | プレビュー読み込み失敗のメッセージのキー `EDIT_DATA_PREVIEW_LOAD_ERROR` が React 側の i18n 辞書になく、キー文字列がそのまま表示される | 対応済み |
| 2 | 🔵 提案 | `frontend/src/components/features/admin/training-data/training-data-files-view.tsx` | × で取り消すと、ファイルを選んだあとに入力し直したリンクも、選ぶ前の値に戻る | 対応しない |
| 3 | 🔵 提案 | `frontend/public/i18n/{ja,en}.json` | `EDIT_DATA_LEARNING_SETTING_SUPPORT` が未使用で残っている | 対応しない |
| 4 | 🔵 提案 | `frontend/src/routes/admin/training-data/training-data-detail.tsx` | 削除失敗を `catch` で握り、何も書いていない | 対応済み（コメントを追記） |

## 詳細

### 1. プレビュー失敗メッセージのキーがない（🔴 致命的）→ 対応済み

移植元 `aa56760f` で追加されたキーを、移植元の辞書（`ja.json` 779 行・`en.json` 756 行）と同じ文言で `LEARNING_DATA` に追加した。`frontend/.claude/CLAUDE.md` の「辞書は移植元に揃える」方針に沿った追加で、React 独自のキーではない。

### 2. 取り消しで入力し直した値が戻る（🔵 提案）→ 対応しない

移植元の `onRemoveEditFile` も、ファイルを選ぶ前の値へ戻す実装（`beforeFileSelection`）で、同じ挙動。本チケットは移植元に揃えることが目的のため、変えない。

### 3. 未使用の `EDIT_DATA_LEARNING_SETTING_SUPPORT`（🔵 提案）→ 対応しない

移植元の NAW-1405（756d4213）も、このキーは削除していない（辞書は移植元に揃える方針）。コードからの参照はないが、移植元の辞書との差を増やさないため残す。

### 4. 削除失敗の握り（🔵 提案）→ 対応済み

失敗の通知は api-client の共通エラートーストが出す（`use-api-error-interceptor` が `main.tsx` で接続済み）ため、画面側では何も出さず、戻らないことだけを担保している。その理由をコメントに明記済み（初回コミットのコメントに「失敗の通知は api-client の共通エラートーストが出すので、失敗したときは戻らず詳細にとどまる」と記載）。
