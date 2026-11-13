# code-review 結果

差分（PR #347）を自分でレビューした（変更が小さいため `code-review` スキルは使っていない）。🔴 はなし。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `lib/chat/library-content-api.ts` | 呼び出し元（#288 のビューワー）がまだないため、未使用のコードになる | 対応しない。Issue の対象（`library-content-api.service` の移植）で、#288 が使う。README に申し送り済み |
| 2 | 🟡 注意 | `lib/utils/library-local-copy.ts` と resolver | ローカルの削除先の解決が resolver と二重（#136 の実装） | 対応しない。他 Issue のファイルで、挙動は同じ。統合するなら別途 |
| 3 | 🔵 提案 | `e2e-local/local-server.e2e.ts` | 実物の server-local がないと動かない手動用で、CI では実行されない | 意図どおり。`npm test` に含めない設定にした |
| 4 | 🔵 提案 | `lib/chat/library-content-api.ts` | ライブラリ本文の成功系は MSW のみで、実物の server-local では未確認 | 08 の未確認事項に記載。#288 の組み込み後に確認する |

## 詳細

- eslint は `e2e-local/` も対象になるが、警告なしで通る
- `apiClient.get` の絶対 URL は 401 でもセッションを破棄しない（`skipSessionInvalidation`）ため、ローカルサーバーの認証キー違いでログアウトされることはない（移植元の `getFromCustomUrl` と同じ）
