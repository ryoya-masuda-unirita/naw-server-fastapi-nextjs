# code-review 結果

## 指摘一覧

指摘なし。

## 詳細

`/code-review`（medium effort）を実行した結果、以下の観点で確認したが指摘事項はなかった。

- 正しさ: `UserService.get_users` の `where()` に `User.role != UserRole.SYSTEM` を追加した
  変更が、既存の `tenant_id` フィルタ・後段の `role` クエリパラメータによるフィルタと
  正しくANDで合成されること。`role=SYSTEM` を明示指定した場合に矛盾条件となり0件になる
  挙動は、移植元 naw-server（`UserSpecifications.visibleToAdmin().and(...)`）と同一で
  意図した仕様であることを確認した
- 呼び出し元への影響: `UserService.get_users` の呼び出し元は `routers/users.py` の
  `get_users` エンドポイントのみであり、戻り値の型・シグネチャに変更はない
- 追加テストの妥当性: `TestGetUsersExcludesSystemRole` の2ケースについて、使用している
  fixture（`tenant`・`admin_user`・追加のSYSTEMユーザー）から期待される
  `totalElements`・`content`の値を再計算し、アサーションが正しいことを確認した
- クリーンアップ・簡潔性: 差分が6行と小さく、簡略化の余地はなかった
- `backend/.claude/CLAUDE.md` の規約（型ヒント・コメントは「なぜ」を書く・テストの
  英語メソッド名+日本語docstring等）への違反なし
