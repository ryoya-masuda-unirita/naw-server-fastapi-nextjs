# frontend-angular — Codex 運用ガイド

このディレクトリは `secuaigent-client`（Angular）をモノレポに取り込んだ動作確認用フロントエンドである。ルート `AGENTS.md` の指示に加えて以下を優先すること。

## 役割

- React 移植先ではなく、バックエンド（`backend/`）の動作確認用フロントエンドとして扱う
- 同期依頼では `.codex/skills/frontend-angular-sync/SKILL.md` を先に読む
- `secuaigent-client` または `frontend-angular` が明示されている同期依頼では、`frontend/`（React）との確認は不要

## 参照元

- フロントエンド参照元: `~/Documents/secuaigent-client`
- バックエンド参照元: `~/Documents/naw-server`

`secuaigent-client` は途中から git 管理のため、履歴だけで追えない箇所がある。必要に応じて最新コードを直接読むこと。

## 技術スタック

- Angular（Standalone Component）
- NgRx Signals（`signalStore`）
- Tailwind CSS
- ngx-translate（`public/i18n/ja.json` / `public/i18n/en.json`）
- `ApiClientService`（`src/app/core/services/api-client.ts`）
- HttpInterceptor ベースのモック
- Vitest

## 開発コマンド

```bash
npm start
npm run start:local
npm test
npm run lint
```

このモノレポではバックエンド接続先を `http://localhost:8001`、開発サーバーを `http://localhost:4201` として扱う。

## アーキテクチャ規約

```text
Component   UI の表示とユーザー操作
Store       signalStore による状態管理と非同期処理
Service     API 呼び出しのみ。状態を持たない
```

- Component は Standalone（`standalone: true`）で作成する
- `ChangeDetectionStrategy.OnPush` を使う
- 文言は必ず i18n ファイルを通す。ハードコードしない
- `any` 型は使わず、必要な型は `src/types/` に作る
- モックの match パスは `apiBaseUrl` を除いたパスで書く

## テスト

- Vitest を使用する。Jest 前提で書かない
- Component テストは TestBed + 子コンポーネントのスタブ化を基本にする
- Store テストは本物 Store + Service モックを基本にする
- Service テストは HttpClient のみモックする
- `describe` は日本語でグループ化する
- `test` はユーザー視点の振る舞いで書く
- フィクスチャは `FIXTURE_` プレフィックスを使う
- async/await ベースのハンドラは `flushMicrotasks()` 相当で待つ

## コメント

コメントは「何をしているか」ではなく「なぜそうしているか」を書く。コードを読めば分かる説明、タスク番号、削除済みコードの残骸は残さない。

略語は避ける。

| 使わない | 使う |
|---|---|
| BE | バックエンド / APIサーバー |
| FE | フロントエンド |
| I/F | インターフェース |

## 作業方針

- `frontend-angular/` は同期・動作確認用途が主目的。通常のバックエンド Issue 対応中に見つけた Angular 側の不具合は、その場で無断修正しない
- 同期後は `npm install`、差分確認、必要に応じた `npm run start:local` での疎通確認を行う
- コミットメッセージ規約はルート `AGENTS.md` に従う
