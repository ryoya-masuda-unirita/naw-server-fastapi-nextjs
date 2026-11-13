# code-review 結果

`/code-review medium 327` の結果。🔴（致命的）に当たるものはなし。移植元と同じ挙動の指摘は「移植元どおり」として対応しない（目標が完璧なクローンのため）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `tag-edit-settings-dialog.tsx` | 説明を空にして保存しても説明が消えない | 対応しない（移植元どおり。backend も空・未指定は現状維持） |
| 2 | 🟡 注意 | `library-tags-tab.tsx` | 最終ページの行を全部消すと範囲外のページに残る | 対応済み |
| 3 | 🟡 注意 | `use-library-tags.ts` | backend が `sort` を無視するため並べ替え欄が効かない | 対応しない（backend は直さない。03 に記載し申し送り） |
| 4 | 🔵 提案 | `library-content-tab.tsx` | 絞り込みはログインID、所有者判定はプロフィールの UUID と出どころが別 | 対応しない（移植元どおり。backend の `createdBy` は `login_id` 検索、`userId` は UUID のため両方が必要） |
| 5 | 🔵 提案 | `library-local-copy.ts` | `endpoints` 欠落時の防御、LOCAL_SERVER でない先頭エンドポイントへのフォールバック | 対応しない（移植元どおり。backend は常に配列を返す） |
| 6 | 🟡 注意 | `use-library-list.ts` | 削除前の詳細取得の失敗を無視し、ローカル本文が孤立しうる | 対応しない（移植元どおり。`catch → null`） |
| 7 | 🟡 注意 | `library-edit-settings-dialog.tsx` | 名前の入力チェックなし | 対応しない（移植元どおり。backend の 400 をトースト） |
| 8 | 🔵 提案 | `use-library-list.ts` | クエリキー `['user','profile']` が汎用的 | 対応しない（移植元の `profileQuery` と同じキー。他に使う画面はない） |
| 9 | 🟡 注意 | `library-format.ts` | `navigator.clipboard` がないと同期で例外 | 対応済み |
| 10 | 🔵 提案 | `tag-edit-settings-dialog.tsx` | 検証は `trim` だが送る名前は `trim` していない | 対応しない（移植元どおり） |

## 詳細

### 2. 範囲外のページ → 対応済み
取得成功後に `page > totalPages` なら最終ページへ戻す（コンテンツタブと同じ）。移植元のタグタブにはない補正で、削除後に空のページが残る症状を避ける。テスト `総件数が減って現在のページが範囲外になったら最終ページへ戻ること` を追加。

### 9. クリップボードがない環境 → 対応済み
`navigator.clipboard` がなければコンソールに残して戻る（「コピー済み」の表示は移植元どおり出る）。

### 1・3〜8・10 → 対応しない
いずれも移植元（Angular）の `library.store.ts`・`tags.store.ts`・各ダイアログが同じ手順・同じ判定で、同じ症状を持つか、backend の仕様に由来する。クローンを保つため変えず、後続 Issue の候補として申し送る（特に 3 の backend の `sort` 対応、6 の詳細取得失敗時の扱い、7 のコンテンツ名の入力チェック）。
