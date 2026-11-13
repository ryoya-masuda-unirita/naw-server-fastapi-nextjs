# code-review 結果

`/code-review medium 332` の結果。🔴（致命的）に当たるものはなし。移植元と同じ挙動の指摘は「移植元どおり」として対応しない（目標が完璧なクローンのため）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `training-folder-add-dialog.tsx` | 説明の上限が 1000 文字だが backend は 255 文字まで。256〜1000 文字は 422 | 対応しない（移植元どおり 1000。03 に記載し申し送り。backend の上限を移植元の実装と突き合わせてから決める） |
| 2 | 🟡 注意 | `use-training-data.ts` | 作成後に取り直さず現在のページの先頭に足すため、ページ・並び順・検索と食い違う | 対応しない（移植元 `createFolder` と同じ。03 に記載） |
| 3 | 🟡 注意 | `training-folder-add-dialog.tsx` | 送信中に Esc・背景クリックで閉じられ、二重作成の恐れ | 対応済み（送信中は閉じない。テスト追加） |
| 4 | 🟡 注意 | `training-folder-add-dialog.tsx` | 接続先の取得に失敗すると、種別だけが切り替わり候補と食い違う | 対応しない（移植元も同じ。失敗は共通エラートーストで通知。ラジオを選び直すと再取得する） |
| 5 | 🔵 提案 | `training-folder-add-dialog.tsx` | 必須判定が空白だけの入力を通す | 対応しない（移植元の `Validators.required` どおり。03 に記載） |
| 6 | 🟡 注意 | `training-data.tsx` | 検索が入力のたびに API を呼ぶ | 対応しない（移植元も debounce なし） |
| 7 | 🔵 提案 | `training-data.tsx` | `label htmlFor` の対象 id が子に付いていない | 対応しない（移植元の `id` も同じく部品の内側には付かない。ライブラリ・チーム一覧も同じ作り） |
| 8 | 🔵 提案 | `training-folder-add-dialog.tsx` | `endpointError` が `fieldError` と二重 | 対応済み（`fieldError('endpointId')` に統一し、関数を削除） |

## 詳細

### 3. 送信中に閉じられる → 対応済み
`Dialog` の `onClose`（Esc・背景クリック）を、送信中は無視する。移植元の MatDialog には同じ穴があるが、二重作成につながるため塞いだ。テスト `送信中は Esc でダイアログを閉じられないこと` を追加。

### 8. 二重の仕組み → 対応済み
接続先の必須エラーは `{ required: true }` を `resolveControlError` に渡せば同じ `VALIDATION.REQUIRED` になるため、専用関数を削除した。

### 1・2・4〜7 → 対応しない
いずれも移植元（Angular）の `training-data.component.ts`・`training-data.store.ts`・`training-folder-modal.service.ts` が同じ手順・同じ判定で同じ症状を持つか、backend の仕様に由来する。クローンを保つため変えず、後続 Issue の候補として申し送る（特に 1 の説明の文字数上限、2 の作成後の一覧の扱い）。
