# code-review 結果

`/code-review medium 458` の結果。🔴 致命的・🟡 注意は 0 件、🔵 提案 5 件。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `e2e-spec/docker/nginx.conf` | 存在しない JS・CSS にも `index.html` を 200 で返し、原因が分かりにくい | 対応済み |
| 2 | 🔵 提案 | `e2e-spec/docker/compose.override.yml` | `!reset` に compose の最低バージョンが要るのに書いていない | 対応済み |
| 3 | 🔵 提案 | `e2e-spec/src/fixtures.ts` | `toHaveURL` の正規表現が `/dashboard` を部分一致で見ている | 対応済み |
| 4 | 🔵 提案 | `e2e-spec/tests/12-workspace-settings.spec.ts` | 見出しを押してフォーカスを外す回避策が、レイアウトのずれを隠している | 対応しない |
| 5 | 🔵 提案 | `e2e-spec/docker/compose.override.yml` | backend のポートの既定値 58100 が `env.ts` と二重管理 | 対応済み |

## 詳細

### 1. 存在しない静的ファイルにも 200 を返す（🔵）→ 対応済み

`location /assets/` を足し、ビルド済みのファイルが無いときは 404 にした。`curl` で、存在しない `/assets/none.js` が 404、実在するバンドルが 200、`/admin/assistants` への直接アクセスが 200 であることを確かめた。

### 2. compose の最低バージョン（🔵）→ 対応済み

`e2e-spec/README.md` の前提に「compose v2.24 以上」と理由を書いた。手元は v5.5.0。

### 3. URL の部分一致（🔵）→ 対応済み

`url.pathname === DASHBOARD_PATH` の完全一致に変えた。ログイン画面からダッシュボードへ移る途中の URL に `/dashboard` が含まれても、先に通り抜けない。

### 4. 見出しを押す回避策（🔵）→ 対応しない

指摘のとおり、レイアウトのずれ自体は直していない。ただし、ずれは実ブラウザでも起こる画面側の挙動で、このテストの目的（接続サーバーの選択後の動作）を確かめるには、ずれが落ち着いてから操作する回避策が必要。画面側のずれを直すのは、この Issue（専用環境の配信方式）の範囲外。指摘の「ずれが遅れて描画される」状況は、通し実行 2 回と単独実行で再現していない。

### 5. 既定ポートの二重管理（🔵）→ 対応済み

compose 側の既定値をやめ、`DEMO_BACKEND_PORT` が無いときは起動を失敗にした（`src/environment.ts` が常に渡す）。`env:up` が通ることを確かめた。

## 対応後の確認

- `npm run lint`・`npm run typecheck`: エラー 0
- 専用環境を起動し直して、`tests/03-login`・`09-library`・`12-workspace-settings`・`19-template` の 109 件が OK
