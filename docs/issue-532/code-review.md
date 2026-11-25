# code-review 結果

設定値と環境変数の追加だけの変更のため、`/code-review` は、自己レビューと `terraform fmt`・`validate` で代えた。

- `${{ vars.X || 'false' }}` は、未登録のとき空文字になるため、`|| 'false'` で既定を false にした（`TF_VAR_...=""` は、bool として不正）
- `${{ github.repository }}` は、OIDC の `sub` に使われるリポジトリ名と同じ形（`<オーナー>/<リポジトリ>`）
- 🔴 の指摘なし
