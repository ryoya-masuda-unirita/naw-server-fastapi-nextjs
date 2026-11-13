# code-review 結果

PR #338 に対して `/code-review high 338` を実行した結果と対応。🔴 は 0 件。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `hooks/use-group-detail.ts` | 削除成功後に詳細のキャッシュを消すため、まだ表示中の画面が削除済みのグループを取り直して 404 のエラートーストが出る | 対応済み |
| 2 | 🟡 注意 | `hooks/use-group-users.ts` ほか | 追加ダイアログの候補の取得失敗を `[]` にする（グループ管理者は `GET /api/admin/users` が 403） | 対応しない |
| 3 | 🟡 注意 | `hooks/use-group-users.ts` ほか | 一括削除の `Promise.all` で 1 件でも失敗すると読み直さず、削除済みの行が残る | 対応しない |
| 4 | 🔵 提案 | 3 つの filter | 検索を 1 文字ごとに取得する（debounce なし） | 対応しない |
| 5 | 🔵 提案 | `hooks/use-group-assistants.ts` | サーバー名・ON/OFF が日本語の直書き | 対応しない |
| 6 | 🔵 提案 | 3 つのタブ | 最後のページの行を全部消すとページ番号が範囲外のまま | 対応しない |
| 7 | 🔵 提案 | `lib/utils/auth-helpers.ts` | 表示名が同じ別ユーザーも「自分」とみなす | 対応しない |
| 8 | 🔵 提案 | `group-detail-users.tsx` | 全選択に自分が入り、選択削除で黙って除外される | 対応しない |
| 9 | 🔵 提案 | 3 つの hooks・page | 足場の重複 | 対応しない |
| 10 | 🔵 提案 | `group-users-filter.tsx` ほか | 並べ替えの順序が null のとき `sort=field,` になりうる | 対応しない |

## 詳細

### 1. 削除後に詳細を取り直す（🟡）→ 対応済み

`useDeleteGroup` の `onSuccess` で詳細のキャッシュを `removeQueries` していたため、購読中の `GroupDetailPage` が再描画で `GET /api/admin/groups/{id}` を投げ直し、削除済みで 404 → 共通エラートーストが出る。`removeQueries` をやめ、一覧のキャッシュの無効化だけにした。回帰テストとして、削除後も詳細の取得が 1 回のままであることを確認する（`group-detail.test.tsx`）。

### 2. 候補の取得失敗が `[]`（🟡）→ 対応しない

移植元の `loadAddUserOptions` / `loadAddAssistantOptions` / `loadAddTemplateOptions` も `catch` で `[]` にする。ただし `skipGlobalErrorToast` は付けていないので、失敗時は共通のエラートースト（403 を含む）が出ており、無言ではない。移植元どおり。

### 3. 一括削除の `Promise.all`（🟡）→ 対応しない

移植元の `removeUsers`・`removeAssistants`・`removeTemplates` が `Promise.all` で、失敗時は読み直しも選択解除もしない。移植元どおり（`03_詳細設計.md` の判断 5）。backend 側の改善（一括削除 API）が入ったら見直す。

### 4〜10 → 対応しない

4・5・6・7・8・10 は、いずれも移植元の同じ箇所の挙動（debounce なし・直書きの日本語・ページの丸め直しなし・`matchesCurrentUser` の判定・全選択で自分を含める・順序の変換）をそのまま移したもの。目標が完璧なクローンのため揃えている。9 は 3 タブの共通化を見送った（移植元も別の store・service で複製している）。必要なら別 Issue で整理する。
