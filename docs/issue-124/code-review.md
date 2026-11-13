# code-review 結果

`/code-review medium 319` の結果。🔴（致命的）に当たるものはなし。移植元と同じ挙動の指摘は「移植元どおり」として対応しない（目標が完璧なクローンのため）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `hooks/use-template-list.ts` | 作成成功後にグループ紐付けが失敗すると、ダイアログが残り再送信で重複作成 | 対応しない（移植元どおり） |
| 2 | 🟡 注意 | `template-form-dialog.tsx` | 編集の途中失敗で `previousGroupIds` が古いまま、再試行が 404 | 対応しない（移植元どおり） |
| 3 | 🟡 注意 | `template-form-dialog.tsx` | グループ取得失敗・同名グループで編集前のグループ ID を誤る | 対応しない（移植元どおり） |
| 4 | 🔵 提案 | `template-list-filter.tsx` | 最初の操作で `sortField: null` が既定の並べ替えを上書き | 対応しない（移植元どおり） |
| 5 | 🟡 注意 | `store/template-list-store.ts` | 画面を離れても検索・ページ・選択が残り、検索欄だけ空に戻る | 対応済み |
| 6 | 🟡 注意 | `routes/admin/templates/template-list.tsx` | 最終ページの行を全部消すと範囲外のページに残る | 対応済み |
| 7 | 🔵 提案 | `template-list-filter.tsx` | 検索の debounce なし | 対応しない（移植元どおり） |
| 8 | 🟡 注意 | `routes/admin/templates/template-list.tsx` | グループ未取得中のチーム絞り込みが無視される | 対応しない（移植元どおり） |
| 9 | 🟡 注意 | `hooks/use-template-list.ts` | 一括削除の一部失敗で、削除済みが残る・再試行が 404 | 対応しない（移植元どおり） |
| 10 | 🔵 提案 | `routes/admin/templates/template-list.tsx` | ウィンドウフォーカスの再取得で一覧がスピナーに替わる | 対応済み |

## 詳細

### 5. 画面を離れても条件が残る → 対応済み

移植元もルート singleton のストアで条件が残るが、検索欄（フィルターのローカル状態）は空に戻るため、見えない条件で一覧が絞られる。画面のアンマウント時に `store.reset()` を呼ぶようにした（移植元との差。後続の操作は移植元と同じ）。

### 6. 範囲外のページ → 対応済み

取得成功後に `pageIndex > totalPages` なら最終ページへ戻す。テスト `総件数が減って現在のページが範囲外になったら最終ページへ戻ること` を追加。

### 10. フォーカス再取得 → 対応済み

移植元は画面を開いたときと操作したときだけ読み込む。`useTemplateList` に `refetchOnWindowFocus: false` を指定した。

### 1・2・3・4・7・8・9 → 対応しない

いずれも移植元（Angular）の `template-list.component.ts`・`template-list-filter`・`template-list.store.ts` が同じ手順・同じ判定で、同じ症状を持つ。クローンを保つため変えず、後続 Issue の候補として申し送る（特に 1・2・9 の部分失敗の扱い、4 の既定の並べ替え表示）。
