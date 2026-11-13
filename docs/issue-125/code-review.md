# code-review 結果

`code-review` スキルは HEAD が detached になることがあるため使わず、PR #321 の差分を自分で読んでレビューした（移植元テンプレート・ts との突き合わせを含む）。🔴 は 0 件。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `components/features/admin/users/focus-first-invalid-field.ts` | 入力チェック失敗時のフォーカス処理が 100ms の `setTimeout` で `getElementById` するため、ダイアログを閉じた後や別のダイアログに当たりうる（テストで前のテストの処理が次のテストの入力欄に当たり、入力が欠けた） | 対応済み（フックにしてアンマウント時に取り消す） |
| 2 | 🟡 注意 | `hooks/use-admin-users.ts` ほか | backend が移植元と違う（`loginKey` 露出・`page`・`loginKeyAction`/`issueLoginKey` 未対応） | 対応しない（#309 の範囲。画面側で吸収できる部分は吸収し、`docs/issue-125/03_詳細設計.md` に記載） |
| 3 | 🟡 注意 | `routes/admin/users/user-list.tsx` | 検索欄のラベルの `htmlFor="user-search"` が指す要素がない（`SearchInput` が `id` を受けない） | 対応しない（共通部品 #278 の範囲。ラベルの見た目は移植元どおり。テストは `data-testid` を使う） |
| 4 | 🔵 提案 | `routes/admin/users/user-list.tsx` | 削除の確認ボタンを連打すると DELETE が二重に飛ぶ | 対応しない（移植元も同じ挙動。移植元に合わせる） |
| 5 | 🔵 提案 | `routes/admin/users/user-list.tsx` | 読み込み中の表示 | 対応済み（移植元の `loading` アイコンは辞書になく描画されないため `CircularLoading`。設計書に理由を記載） |

## 詳細

### 1. フォーカス処理の取り消し（🟡）→ 対応済み

`useFocusFirstInvalidField()` が待機中のタイマーを持ち、アンマウント時と再呼び出し時に `clearTimeout` する。追加・編集ダイアログはこのフックを使う。

### 2. backend との差（🟡）→ 対応しない

backend は今回の担当外（#309 が移植元 server に揃える）。それまでは次の動きになる。

- ログインキーの発行・再発行・削除は backend が受けないため効かない
- 更新の応答に保存済みの `loginKey` が入るため、更新のたびにキー表示ダイアログが出る

#309 のマージ後に、`admin-users-api-normalize.ts` の `page`・`loginKey` の読み取りは不要になる（削除できる）。

## 確認した点（指摘なし）

- 移植元 `submitAddUser`・`submitEditUser`・`submitDeleteUsers` と、送る値（trim・大文字の権限・`KEEP` を送らない・SYSTEM の扱い）・失敗時の挙動が同じ
- 表示ダイアログは `disableClose`、閉じたら `reveal` を `null` にして平文を状態から消す
- 選択は読み込んだページにあるものだけを数える（移植元は読み込みのたびに絞り込む）
- 不要になったコード・孤立した export はない（`UserListMenu` の `onEdit`/`onDelete` など全て使用）
