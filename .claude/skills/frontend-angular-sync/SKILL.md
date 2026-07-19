---
name: frontend-angular-sync
description: Use when syncing frontend-angular/ in this monorepo with the upstream secuaigent/client (Angular) repo — copying the latest app and reapplying monorepo-specific config (backend port 8001, dev server port 4201, disabled standalone CI).
---

# frontend-angular 同期 skill

`frontend-angular/` は `~/Documents/secuaigent/client`（Angular、単独リポジトリ）をこのモノレポに
そのまま取り込んだもの。バックエンド（FastAPI, `backend/`）の動作確認用フロントエンドとして使う。

`secuaigent/client` は日々更新されるため、`frontend-angular/` は定期的に**丸ごと同期**する。
`src/` 配下の個別ファイルだけを選んでコピーする方式は取らない
（secuaigent/client 側の変更を追従し続けるコストが高く、取りこぼしが起きるため）。

## 使う場面

- `secuaigent/client` の最新実装を `frontend-angular/` に反映したいとき
- `frontend-angular/` がモノレポ向け設定（バックエンドポート・devサーバーポート等）とズレていないか確認したいとき

## 同期の考え方

1. `secuaigent/client` 側の `develop` ブランチを最新化する（`git fetch` → `git checkout develop` → `git pull --ff-only`）
2. `frontend-angular/` 配下を一旦クリアし、`secuaigent/client/` を丸ごとコピーする
   （`.git/`, `node_modules/`, `.angular/`, `dist/`, `coverage/` は除外）
3. モノレポ向けの設定差分を再適用する（下表）

`secuaigent/client` 自体はこのモノレポに取り込まない（コピー元として参照するのみ）。

### 再適用する設定差分

| ファイル | 変更内容 | 理由 |
|---|---|---|
| `proxy.conf.local.js` | rsyncの段階で同期対象から除外（コピーしない、モノレポ側の既存ファイルを維持） | `BACKEND_PROXY_TARGET`環境変数対応がモノレポ固有の実装のため、`Dockerfile.dev`と同じく最初から同期対象に含めない（過去にsed置換・上書きコピーいずれの方式でも取りこぼしが発生したため） |
| `proxy.conf.dev.js` | `DEV_SERVER` → `http://localhost:8001` | 同上 |
| `angular.json` | `serve.options.port` → `4201` | `4200` は他プロジェクトと衝突する可能性があるため |
| `src/environments/environment.development.ts` | `apiBaseUrl: '/api'`, `authBaseUrl: ''` | 外部URL直書きをやめ、プロキシ経由の相対パスにするため |
| `src/environments/environment.local.ts` | 同上 | 同上 |
| `.vscode/launch.json` | `localhost:4200` → `localhost:4201` | devサーバーのポートに合わせるため |
| `README.md`（frontend-angular内） | `localhost:4200` → `localhost:4201` | 同上 |
| `.github/workflows/deploy-dev.yml` | 全行コメントアウトし `# DISABLED` を先頭に付与 | 単独リポジトリ向けのCIで、モノレポでは使わないため |
| `.gitlab-ci.yml` | rsyncの段階で同期対象から除外（コピーしない） | secuaigent側がGitLab CIに移行したファイルで、モノレポでは使わないため |
| `Dockerfile.dev` | rsyncの段階で同期対象から除外（コピーしない、モノレポ側の既存ファイルを維持） | secuaigent/client単体には存在しないモノレポ専用ファイル（docker-compose用）。同期対象に含めると`rsync --delete`で消えてしまう（過去に実際発生） |

`package.json` / `src/environments/environment.ts` / `src/environments/environment.production.ts` /
アプリケーションのビジネスロジック本体は変更不要（そのまま使える）。

## 実行手順

```bash
bash .claude/skills/frontend-angular-sync/scripts/sync.sh
# 参照元を変える場合
bash .claude/skills/frontend-angular-sync/scripts/sync.sh /path/to/secuaigent/client
```

- `frontend-angular/` または `secuaigent/client` 側に未コミットの変更がある場合はスクリプトが停止する（レビュー前の上書き事故・他リポジトリの作業中コードの巻き込みを防ぐため）。`frontend-angular/` 側は意図的に上書きするときのみ `--force` を付ける
- 実行後は必ず以下を行う
  1. `cd frontend-angular && npm install`（依存関係の差分を反映）
  2. `git status` / `git diff -- frontend-angular` で差分を確認する（意図しないモノレポ設定の巻き戻りがないかを見る）
  3. `npm run start:local` 等で実際に起動し、バックエンド（`http://localhost:8001`）と疎通できることを確認する
  4. 差分をコミットする（コミットメッセージ規約はルート `CLAUDE.md` に従う）

## 注意事項

- このskillは `frontend-angular/` の同期専用。`frontend/`（React移植）や `backend/` には触れない
- 同期後にモノレポ向け設定（上表）が正しく再適用されているかを必ず確認すること。`secuaigent/client` 側の該当ファイルの書き方が変わると、`sed` の置換パターンが一致せず反映漏れが起きる可能性がある
