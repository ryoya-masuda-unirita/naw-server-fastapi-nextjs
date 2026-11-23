# code-review 結果

PR #412 の差分を読んで確認した。🔴 致命的な指摘はなかった。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `client/src/components/features/admin/feedback/feedback-local-learning.ts` | クラウドのフォルダでも追加学習の前にフォルダ詳細の取得が 1 回増える | 対応しない |
| 2 | 🟡 注意 | `client/src/components/features/admin/training-data/local-training-api.ts` | パスの綴り `additionalLeaning` が通常の綴りと違う | 対応しない |
| 3 | 🔵 提案 | `client/src/components/features/admin/feedback/feedback-local-learning.test.ts` | トーストの文言を検証できず件数だけを見ている | 対応しない |

## 詳細

### 1. クラウドのフォルダでも詳細の取得が増える（🟡 注意）→ 対応しない

移植元 `FeedbackLocalLearningService.addIfLocalFolder` も、LOCAL かどうかを判定するために毎回 `getById` を呼ぶ。Issue の「フォルダの種類は持たず都度取る」とも一致する。フォルダ一覧（`/api/admin/indexes`）の応答にはフォルダの種類が入らないため、一覧の値で代用もできない。

### 2. パスの綴り（🟡 注意）→ 対応しない

移植元の `LOCAL_SERVER_API_PATH.ADDITIONAL_LEARNING` と、移植先の `secuaigent-server-local/app/routers/indexes.py`（`/additionalLeaning`）の綴りに合わせている。直すと受け口と合わなくなる。API パスの定義にコメントを残した。

### 3. トーストの文言（🔵 提案）→ 対応しない

テストでは i18n が未初期化で `i18n.t` が値を返さないため、件数だけを確認した。文言の指定は共通の `viaLocalServer`（#390 で導入済み）の責務で、本件で変えていない。
