# frontend — Codex 運用ガイド

このディレクトリ配下では、ルート `AGENTS.md` の指示に加えて以下を優先すること。

## 移植元

Angular 実装: `~/Documents/secuaigent-client`

実装前に必ず最新状態を確認すること。

## 技術スタック

- Vite + React 19
- TypeScript
- React Router v7
- Tailwind CSS
- TanStack Query
- Zustand
- `fetch` ラッパー: `src/lib/api-client.ts`
- react-i18next
- MSW
- Vitest + React Testing Library

## デザイン移行の方針

Angular のデザインを忠実に React へ移行すること。独自の簡易実装で代替しない。

### 移行元デザインリソース

| リソース | パス |
|---|---|
| グローバル CSS（カラー・フォント・コンポーネント） | `~/Documents/secuaigent-client/src/styles.css` |
| 翻訳ファイル（日本語） | `~/Documents/secuaigent-client/public/i18n/ja.json` |
| 翻訳ファイル（英語） | `~/Documents/secuaigent-client/public/i18n/en.json` |
| 各ページの HTML テンプレート | `*.component.html` |

### 移行手順

1. Angular の HTML テンプレートを必ず先に読む
2. `styles.css` のカスタムカラー・カスタムクラスを `src/index.css` に移す
3. Tailwind クラスは Angular の見た目に対応させて選ぶ
4. Angular 固有の UI 部品は React コンポーネントへ置き換える

### やってはいけないこと

- `bg-blue-600` などの汎用 Tailwind クラスで Angular のカスタムカラーを代用しない
- Angular HTML を読まずに独自レイアウトを実装しない
- デザイン差異を未確認のまま放置しない

## レイヤー責務

```text
Page Component        ルーティング単位の UI
TanStack Query hooks  API 呼び出しとキャッシュ管理
Zustand store         UI 状態管理
api-client.ts         fetch ラッパー
```

## 実装ルール

- API 呼び出しは TanStack Query hooks に寄せる
- UI 状態は Zustand に寄せる
- `any` は使わない
- 型定義は `src/types/` に作る
- 文言は必ず i18n を通す
- コメントは「なぜ」を書く

## Angular → React 対応表

| Angular | React |
|---|---|
| Standalone Component | React Component |
| signalStore（API 呼び出し部分） | TanStack Query |
| signalStore（UI 状態部分） | Zustand store |
| `withComputed` | 必要に応じた導出 state |
| `@Injectable({ providedIn: 'root' })` Service | hooks / Zustand による共有ロジック |
| Guard | React Router loader または認証チェック |
| `HttpInterceptor`（モック） | MSW |
| `ngx-translate` | `react-i18next` |

## Angular からの移植指針

- Angular のデザインを忠実に React へ移行する。独自の簡易実装で代替しない
- 実装前に対象ページの Angular HTML テンプレート（`*.component.html`）を必ず読む
- `~/Documents/secuaigent-client/src/styles.css` のカスタムカラー・カスタムクラスを確認し、React 側の `src/index.css` に必要な定義を反映する
- `~/Documents/secuaigent-client/public/i18n/ja.json` / `en.json` を確認し、文言を i18n 経由で移植する
- `bg-blue-600` などの汎用 Tailwind クラスで Angular のカスタムカラーを代用しない
- Angular HTML を読まずに独自レイアウトを実装しない
- Standalone Component は React Component へ移植
- signalStore の API 呼び出しは TanStack Query へ移植
- signalStore の UI 状態は Zustand へ移植
- Guard は React Router loader または認証チェックへ移植
- `ngx-translate` は `react-i18next` へ移植

## ディレクトリ構造

```text
src/
├── routes/
│   ├── auth/
│   ├── admin/
│   └── chat/
├── components/
│   ├── features/
│   ├── layouts/
│   └── shared/
├── hooks/
├── store/
├── lib/
│   └── constants/
└── types/
```

## 開発コマンド

```bash
npm run dev
npm run build
npm test
npm run type-check
npm run lint
```

## テスト補足

- `describe` は日本語でグループ化する
- `test` はユーザー視点の振る舞いで書く
- フィクスチャは `FIXTURE_` プレフィックスを使う

## HITL 補足

- UI 実装やテストが完了したら、その単位で `06_タスクリスト.md` を更新する
- 動作確認結果は `08_動作確認.md` に事実のみ記録する

## 補足

- frontend 移植 Issue に着手するときは、ルート `AGENTS.md` と `.codex/skills/naw-frontend-issue-workflow/SKILL.md` を先に読むこと
- backend API の実装が未完了なら、frontend 単独で無理に進めず依存関係を整理すること
