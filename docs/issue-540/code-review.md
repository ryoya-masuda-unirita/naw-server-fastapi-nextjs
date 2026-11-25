# code-review 結果

変更が小さい（設定・文書・数行の置き換え）ため、`/code-review` は、自己レビューと PR の CI で代えた。

- 認証キーの空の扱い: waha-emulator は `min_length=1`（config.py:29）、server-local は `min_length=1`（config.py:49）、compose は `:?`（空を弾く）で、いずれも空を弾く
- 🔴 の指摘なし
