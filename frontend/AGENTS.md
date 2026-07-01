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

## Angular からの移植指針

- Standalone Component は React Component へ移植
- signalStore の API 呼び出しは TanStack Query へ移植
- signalStore の UI 状態は Zustand へ移植
- Guard は React Router loader または認証チェックへ移植
- `ngx-translate` は `react-i18next` へ移植

## ディレクトリ構造

```text
src/
├── routes/
├── components/
├── hooks/
├── store/
├── lib/
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
