# code-review（PR #334）

差分（`frontend/src/routes/admin/tenant`・`components/features/admin/tenant`・`hooks/use-tenant.ts`・`store/tenant-store.ts`・`mocks/handlers/admin-tenant.ts`）を移植元と見比べて自己レビューした。

## 🔴 致命的

なし。

## 🟡 注意

1. 利用制限パネルは `SHOW_USAGE_LIMIT_PANELS = false` で画面に出ない（移植元がコメントアウトしているため）。ダイアログ・更新処理は到達できないコードになる。
   - 対応: 判断を `03_詳細設計.md` と PR 本文に明記。ダイアログと更新処理はテストで担保している。移植元でコメントアウトが外れたらフラグを true にする。
2. 編集ダイアログの API キーは backend が返さず空で始まるため、キーを作り直さないと保存できない。
   - 対応: 移植元（server も `apiKey` は書き込み専用）と同じ挙動。docs に記載。
3. `mocks/handlers/admin-tenant.ts` に `GET /api/credit-usage/workspace` の既定応答を含めた。サイドバーの利用量ダイアログ（担当未定）が同じ URL を使うと、ファイル名順で先に読まれるこの既定が優先される。
   - 対応: 形は backend の `WorkspaceCreditUsageResponse` と同じで、他機能のテストは `server.use` で上書きする運用（#324）。PR 本文に記載。

## 🔵 提案

1. 日時・数値の整形（`tenant-format.ts`）は他画面でも要りそうなら共通 util 化する。今は移植元の Pipe と同じ挙動をこの機能内に置いた。
   - 対応: 見送り（共通ファイルを増やさない方針）。
