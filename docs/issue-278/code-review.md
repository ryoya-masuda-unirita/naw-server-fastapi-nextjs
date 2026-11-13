# code-review 結果

PR #314 に `/code-review`（medium）を実行した結果。指摘 10 件。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `frontend/src/components/shared/button.tsx` | `<span class="app-button inline-block">` で包んだため、fullWidth のボタンが全幅にならない | 対応しない |
| 2 | 🔴 致命的 | `frontend/src/components/shared/table.tsx` | 毎回新しい配列（`data={query.data ?? []}` など）を渡すと選択クリアの通知が毎回走り、親が state を更新すると無限レンダーになる | 対応済み |
| 3 | 🔴 致命的 | `frontend/src/components/shared/select.tsx` ほか 3 ファイル | 閉じたときの遅延非表示タイマーを開き直しで取り消さないため、閉じてすぐ開き直すとドロワーが消える | 対応済み |
| 4 | 🔵 提案 | `frontend/src/components/shared/table.tsx` | モバイル行の keyup（Enter/Space）が行内チェックボックスからも発火する | 対応しない |
| 5 | 🔵 提案 | `frontend/src/components/shared/table.tsx` | データ 0 件のときヘッダーのチェックボックスがチェック済みになる | 対応しない |
| 6 | 🟡 注意 | `frontend/src/components/shared/form-input.tsx` | 入力済みのとき `bg-bg-brand-weak` と `bg-white` が同時に付く | 対応しない |
| 7 | 🟡 注意 | `frontend/src/components/shared/dialog.tsx` | ダイアログを重ねて開き、開いた順に閉じると背面のスクロール抑止が正しく戻らない | 対応済み |
| 8 | 🔵 提案 | `dialog.tsx`・`select.tsx`・`form-input.tsx`・`table.tsx` | 'キャンセル'・'確認'・'選択してください'・'Hide password'・'Loading...' がハードコード | 対応しない |
| 9 | 🔵 提案 | `frontend/src/components/shared/select.tsx` | 閉じている Select も document の click を購読し、毎回 close() を走らせる | 対応しない |
| 10 | 🔵 提案 | `frontend/src/index.css` | Angular の要素セレクタ（`app-button.dialog-cancel-btn`・`app-checkbox:has(...)`）が残っていて効かず、`host-selectors.css` と重複している | 対応しない |

## 詳細

### 1. fullWidth のボタンが全幅にならない（🟡 注意）→ 対応しない

移植元の `app-button` もホスト要素が `inline-block` で、その中の `<button>` に `w-full` を付ける構造。React 版は同じ構造にしている。
指摘の login・pw-reset はどちらもボタンの親が `flex flex-col` の form（移植元も同じクラス）で、flex アイテムのホスト要素は横に引き伸ばされるため全幅になる。既存の auth テストも通っている。移植元と同じ挙動なので変えない。

### 2. Table の無限レンダー（🔴 致命的）→ 対応済み

データの変更判定を配列の参照から「要素の並びが同じか」に変えた（`sameRows`）。選択の保持と選択クリアの通知の両方をこの判定にした。
`data` の既定値もモジュール定数の空配列にした。中身が同じ新しい配列なら選択を保って通知しない。親が通知を受けて再レンダーし、毎回新しい空配列を渡しても、通知は 1 回だけになる。
テスト「中身が同じ新しい配列を渡しても選択を保ち、クリアを通知しないこと」「親が選択の通知で再レンダーし毎回新しい空配列を渡しても、通知が繰り返されないこと」を追加した。既存の「データが変わると選択をクリアすること」は、別の行を含むデータに変える形に直した。

### 3. 閉じてすぐ開き直すとドロワーが消える（🔴 致命的）→ 対応済み

`select.tsx`・`select-with-search.tsx`・`multi-select.tsx`・`chunk-select.tsx` を直した。遅延非表示のタイマーを ref に持ち、`open()` と次の `close()` で取り消す。アンマウント時にも取り消す。`form-sort-input.tsx` と同じ方式。
テスト「選んで閉じた直後に開き直しても、ドロワーが表示されたままであること」（モバイル幅）を `select.test.tsx` に追加した。

### 4. モバイル行の keyup がチェックボックスから発火する（🔵 提案）→ 対応しない

React 版の Checkbox はクリック用の `span` で、中の `input` は `tabIndex={-1}`。キーボードフォーカスが乗らないので、チェックボックスから keyup が上がってくることはない。

### 5. データ 0 件でヘッダーがチェック済みになる（🔵 提案）→ 対応しない

移植元 `isAllSelected()` も `selection.selected.length === data().length` で、同じ表示になる。完全なクローンを目標にしているため移植元どおりにした。

### 6. FormInput の背景クラスが同時に付く（🟡 注意）→ 対応しない

移植元テンプレートも `[class.bg-bg-brand-weak]="displayValue() && !isFocused() && ..."` と `[class.bg-white]="!error() && !isDisabled()"` を同時に付けている。同じ Tailwind の出力順になるので、見た目は移植元と同じ。

### 7. 重ねたダイアログのスクロール抑止（🟡 注意）→ 対応済み

開いているダイアログの数を数え、最初の 1 つで `overflow: hidden` にし、最後の 1 つが閉じたときに元の値へ戻すようにした（`lockPageScroll`）。
テスト「重ねて開いたダイアログを開いた順に閉じても、すべて閉じるまでスクロールを止めておくこと」を追加した。

### 8. 文言のハードコード（🔵 提案）→ 対応しない

いずれも移植元が同じ文字列をハードコードしている（DialogComponent の `'キャンセル'`・`'確認'`、Select の placeholder 既定値、FormInput の aria-label、Table の `Loading...`）。文言を移植元に揃える方針なので、そのままにした。i18n 化は移植元側の対応に合わせる。

### 9. 閉じている Select の document click 購読（🔵 提案）→ 対応しない

移植元も `@HostListener('document:click')` で全インスタンスが購読し、閉じていても `close()` を呼ぶ。#3 の修正後は、閉じた状態で `close()` が走っても状態は変わらない（`isOpen` は false のまま、タイマーは取り消してから張り直す）。表示上の不具合はなく、1 画面に置く数も多くないため、移植元どおりにした。

### 10. index.css の要素セレクタ（🔵 提案）→ 対応しない

`index.css` は移植元 `styles.css` と同じ内容に保つ方針（移植元が更新されたときに差分を取り込みやすくするため。ファイル冒頭のコメントに明記）。
要素セレクタのルールは React では効かないので、`host-selectors.css` にクラスセレクタ版を置いている（そのファイルの冒頭に元のルールを記載）。
