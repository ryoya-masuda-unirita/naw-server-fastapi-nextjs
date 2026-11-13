# code-review 結果

差分の自己レビュー（`code-review` スキルは GraphQL 上限のため使わず、差分を読んで確認）。🔴（致命的）に当たるものはなし。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `routes/users/users.tsx` | 最終ページの行を全部消すとページ番号が範囲外のまま残りうる | 対応しない（移植元どおり。モックは 7 件・最小のページサイズが 10 なので常に 1 ページで起きない） |
| 2 | 🟡 注意 | `hooks/use-user-profile.ts` | `use-library-list.ts` の `useUserProfileId` と同じキー `['user','profile']` を別の hook が使う | 対応しない（同じ API・同じキャッシュを共有するだけで、移植元の `profileQuery` と同じ） |
| 3 | 🔵 提案 | `components/layouts/usage-dialog.tsx` | `panelClass="max-w-[90vw]!"` は Tailwind の important に依存 | 対応しない（`.cdk-overlay-pane` の `max-width` がレイヤー外にあるため。コメントに理由を記載） |
| 4 | 🟡 注意 | `user-form-modal.tsx`・`users.tsx` | 移植元の不具合（キャンセル無効・ユーザーID空）を直した | 意図的な差分として 03 に記載 |
| 5 | 🔵 提案 | `group-members.tsx` | 到達不能な処理（アシスタントタブなど）を移していない | 意図的。移植元もテンプレートから呼ばれない。03 に記載 |
