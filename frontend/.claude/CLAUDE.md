# frontend — Claude 向けプロジェクト設定

## 移植元リポジトリ

Angular 実装: `~/Documents/unirita-develop-pj/secuaigent-ref/client`

**このリポジトリは日々更新される**。実装前に必ず最新の Angular 実装を確認してからポートすること。

---

## 技術スタック

| 種別 | 技術 |
|---|---|
| フレームワーク | Vite + React 19 |
| 言語 | TypeScript |
| ルーティング | React Router v7 |
| スタイル | Tailwind CSS |
| サーバー状態管理 | TanStack Query（`useQuery` / `useMutation`） |
| UI 状態管理 | Zustand |
| HTTP | `fetch` ラッパー（`src/lib/api-client.ts`）でラップ |
| i18n | react-i18next |
| モック | MSW（Mock Service Worker） |
| テスト | Vitest + React Testing Library |

---

## デザイン移行の方針

**Angular のデザインを忠実に React へ移行すること。** 独自の簡易実装で代替しない。

### 移行元のデザインリソース

| リソース | パス |
|---|---|
| グローバル CSS（カラー・フォント・コンポーネント） | `~/Documents/unirita-develop-pj/secuaigent-ref/client/src/styles.css` |
| 翻訳ファイル（日本語） | `~/Documents/unirita-develop-pj/secuaigent-ref/client/public/i18n/ja.json` |
| 翻訳ファイル（英語） | `~/Documents/unirita-develop-pj/secuaigent-ref/client/public/i18n/en.json` |
| 各ページの HTML テンプレート | `*.component.html` |

### 移行手順

1. **Angular の HTML テンプレートを必ず先に読む**（`*.component.html`）
2. **`styles.css` のカスタムカラー・カスタムクラスを `src/index.css` に定義する**（`bg-surface-white`、`text-primary` 等）
3. Tailwind クラスを Angular の HTML と 1:1 で対応させる
4. Angular 固有のクラス（`app-button`、`app-form-input` 等）は同等の React コンポーネントに置き換える

### やってはいけないこと

- `bg-blue-600` などの汎用 Tailwind クラスで Angular のカスタムカラーを代用しない
- Angular HTML を読まずに独自レイアウトを実装しない
- デザインの差異を「移行元と違う」と言われるまで放置しない

---

## Angular → React 対応表

| Angular | React |
|---|---|
| Standalone Component | React Component |
| NgRx signalStore（API 呼び出し部分） | TanStack Query（`useQuery` / `useMutation`） |
| NgRx signalStore（UI 状態部分） | Zustand store |
| `withComputed` | `useMemo` |
| `@Injectable({ providedIn: 'root' })` Service | TanStack Query hooks / Zustand（singleton） |
| Angular Guard | React Router の `loader` / コンポーネント内での認証チェック |
| `HttpInterceptor`（モック） | MSW（Mock Service Worker） |
| `ngx-translate` | react-i18next |
| `ChangeDetectionStrategy.OnPush` | `React.memo` / `useMemo` / `useCallback` による再レンダリング最適化 |
| `src/types/` | `src/types/` |
| `src/app/core/constants/` | `src/lib/constants/` |

---

## アーキテクチャ規約

### レイヤー責務

```
Page Component        → ルーティング単位のコンポーネント
TanStack Query hooks  → API 呼び出し・キャッシュ・ローディング・エラー管理
Zustand store         → UI 状態（フィルター・選択状態・ダイアログ開閉等）
api-client.ts         → fetch のラッパー（認証ヘッダー付与等）
```

### TanStack Query のパターン

```typescript
// hooks/use-xxx.ts に切り出す
export function useXxxList(params: XxxListParams) {
  return useQuery({
    queryKey: ['xxx', params],
    queryFn: () => apiClient.get<XxxResponse>('/admin/xxx', { params }),
  });
}

export function useCreateXxx() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateXxxRequest) =>
      apiClient.post<XxxResponse>('/admin/xxx', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xxx'] });
    },
  });
}
```

### Zustand のパターン

```typescript
// store/xxx-store.ts
interface XxxStore {
  selectedId: string | null;
  isDialogOpen: boolean;
  setSelectedId: (id: string | null) => void;
  openDialog: () => void;
  closeDialog: () => void;
}

export const useXxxStore = create<XxxStore>((set) => ({
  selectedId: null,
  isDialogOpen: false,
  setSelectedId: (id) => set({ selectedId: id }),
  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),
}));
```

### バックエンドのレスポンス形式

```typescript
interface PagedResponse<T> {
  content: T[];
  totalElements: number;
  number: number;   // 0-indexed
  size: number;
}
```

`PagedResponse` は `src/types/api-response.type.ts` にある。ただし backend の一部 API はこの形でない（ユーザー一覧の `page`、`GET /api/admin/groups` の `{ data, total, page, size }` など）。移植元の型と backend の応答の違いは `docs/issue-279/api-backend-diff.md` に一覧がある。画面を移植するときは、使う API の行を先に確認する。

### API パス・型・api-client（#279）

- **API パス**は `src/lib/constants/api-paths.ts` の `API_PATHS` を使い、文字列を直書きしない。移植元 `api-paths.config.ts` の全パスに加え、移植元で画面ごとに持っていた定数（`TEMPLATE_LIST_API_PATH`・`ASSISTANT_LIST_API_PATH`・`TRAINING_DATA_API_PATH`・`USER_LIST_API_PATH`）のパスもここにある。キー名は移植元と同じ
  - 移植元と違い、値に `/api` を含める（例: 移植元 `/rooms` → `/api/rooms`）。ログイン系の `/auth/...` だけは `/api` を付けない（api-client が `VITE_AUTH_API_URL` を前置する。#240）
  - 足りないパスが見つかったら、画面のファイルではなく `API_PATHS` に足す
- **API の型**は `src/types/` にある（移植元 `src/types/` と同じファイル名・構成。`chat/`・`admin/` 配下も同じ）。画面ごとに API の型を作り直さない。UI だけで使う型は画面側に置いてよい
- **api-client**（`src/lib/api-client.ts`）
  - `get` / `post` / `put` / `patch` / `delete`（`delete` の本文は `options.body`）。どのメソッドも `headers`・`params` を渡せる
  - `params` の配列は同じキーを繰り返して送る（`tagIds=a&tagIds=b`）。`undefined`・`null` は送らない
  - 本文が `FormData` ならそのまま multipart で送る（`Content-Type` を付けない）
  - `responseType: 'text' | 'blob'`（既定 `json`）。204・空の本文は `null` を返す
  - エラーは `ApiError`（`status`・`body`・`method`・`path`。`message` は `HTTP {status}`）を投げる。通信自体の失敗は `status: 0`
  - 共通のエラートーストを出したくない（画面で個別に表示する）ときは `skipGlobalErrorToast: true`
  - `http(s)://` で始まる絶対 URL はベース URL を付けずに送り、401 でもセッションを破棄しない（移植元の `*FromCustomUrl`。ローカルサーバ向け）
  - SSE など `Response` をそのまま読むときは `apiClient.stream(path, { body, headers })`（共通のエラー処理は通らない）
  - 移植元 `errorInterceptor` 相当（エラートースト・401 でログイン画面へ）は `hooks/use-api-error-interceptor.ts` が `main.tsx` で登録している。トーストは `showErrorToast` に渡す（トースト部品の移植後に接続する）
- **共通 util**: `src/lib/utils/`（`api-datetime`・`display-date`・`validation`・`form-errors`・`scroll-to-error`・`tab-query-param`）、hooks は `use-debounced-value`・`use-tab-query-param`・`use-credit-usage`・`use-token-usage`

### MSW のハンドラー（#279 で決定）

- 置き場所は `src/mocks/handlers/{機能}.ts`（例: `rooms.ts`・`admin-users.ts`）。1ファイルが `xxxHandlers` 配列を export し、`src/mocks/handlers/index.ts` の `handlers` に足す
- URL は `mockPath(API_PATHS.X)`（`src/mocks/utils.ts`）で書く。先頭がワイルドカードになり、ベース URL（`VITE_API_URL`・`VITE_AUTH_API_URL`）に関係なく一致する。パスパラメータは `mockPath(API_PATHS.ROOMS.DETAIL(':roomId'))` のように `:名前` を渡す
- `handlers` はテスト全体（`src/test/setup.ts`）の既定の応答。テストごとに変えたい応答は、テストの中で `server.use(...)` で上書きする（`afterEach` で元に戻る）
- 応答の形は backend（`backend/app/schemas`）の実際の応答に合わせる。移植元のモック（`core/mocks/handlers/*.mock.ts`）は backend と形が違う場合があるため、そのまま写さない
- 現在 MSW はテストだけで使う（開発サーバーでのモック起動はしていない）

---

## ディレクトリ構造

```
src/
├── routes/                 # ルーティング定義・ページコンポーネント
│   ├── auth/               # 認証関連ページ
│   ├── admin/              # 管理者向けページ
│   └── chat/               # チャットページ
├── components/
│   ├── features/           # 機能固有コンポーネント
│   │   ├── admin/
│   │   └── chat/
│   ├── layouts/            # レイアウトコンポーネント
│   └── shared/             # 共通コンポーネント
├── hooks/                  # TanStack Query hooks
├── store/                  # Zustand stores
├── lib/
│   ├── api-client.ts       # fetch のラッパー
│   └── constants/          # ルート定義・API パス定数
└── types/                  # 型定義（API レスポンス型等）
```

---

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# テスト
npm test

# 型チェック
npm run type-check

# Lint
npm run lint
```

---

## コーディング規約

- `any` 型は使わない。型定義を `src/types/` に作成すること
- 文言は必ず i18n ファイルを通す。ハードコードしない
- コメントは「なぜそうしているか」を書く。コードをそのまま言葉にするコメントは書かない

---

## テスト

### テストフレームワーク

Vitest + React Testing Library を使用する。

```typescript
import { vi, describe, test, expect, beforeEach } from 'vitest';
```

### 命名規則

```typescript
// describe は日本語でグループ化する
describe('XxxComponent', () => {
  describe('初期表示', () => { ... });
});

// test はユーザー視点の振る舞いで書く
test('テンプレートを新規作成できること', ...);
test('名前を入力しないと作成できないこと', ...);

// フィクスチャデータは FIXTURE_ プレフィックス
const FIXTURE_TEMPLATE: Template = { id: '1', name: 'test', ... };
```
