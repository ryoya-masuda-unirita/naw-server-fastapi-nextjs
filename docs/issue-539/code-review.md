# code-review 結果
workflow の追加・設定の変更のため、自己レビューと、PR の CI で代えた。
- 🟡 `permissions` を呼び出し側のジョブに書く形に変えた。呼び出される 3 つの workflow（deploy-backend・deploy-frontend・deploy-infra）は、すでに `id-token: write`・`contents: read` を宣言している。呼び出し側が、それ以上の権限を持つと、エラーになる（以下でも以上でもない同じ権限にした）
- 🔵 `concurrency` の `cancel-in-progress: false` は、実行中のデプロイを止めない（途中で止めると、ECS の更新が中途半端になるため）。🔴 の指摘なし
