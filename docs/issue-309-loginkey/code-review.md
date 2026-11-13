# code-review 結果

`/code-review` はセッションの利用上限で実行できなかったため、差分を自分で読んでレビューした。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/models/user.py` | ログインキーは DB にまだ平文で保存されている（移植元はハッシュ保存、NAW-1343） | 対応しない（2 本目の PR で対応。列の置き換えにマイグレーションが要る） |
| 2 | 🟡 注意 | `backend/app/schemas/user.py` | 作成・更新の `loginKey` は「リクエストで指定したキーの折り返し」で、移植元の「サーバー発行キー」とは意味が違う | 対応しない（2 本目の PR で `issueLoginKey`・`loginKeyAction` に置き換える） |
| 3 | 🔵 提案 | `backend/app/routers/users.py` | `Cache-Control: no-store` はエラー応答には付かない | 対応しない（移植元も成功時のみ。エラー本文に秘密は含まない） |
| 4 | 🔵 提案 | `backend/app/schemas/user.py` | `hasLoginKey` は `login_key is not None` のため、空文字のキーも「あり」になる | 対応しない（移植元も null かどうかだけで判定する） |

## 詳細

### 1・2. 平文保存と折り返し（🟡）→ 対応しない

今回の目的は「応答から秘密を出さない」こと。保存方式の変更は DB 変更を伴うため、2 本目の PR で `login_key_hash` への置き換えと合わせて行う。

### 3・4. 🔵 → 対応しない

移植元と同じ挙動のため。
