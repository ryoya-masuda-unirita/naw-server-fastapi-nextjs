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
| Angular Guard（`canActivate`） | ルート要素を包むガードコンポーネント（`src/routes/guards.tsx`。`RequireAuth` 等） |
| `loadComponent`（遅延読み込み） | `src/routes/index.tsx` の `lazyNamed()` + `page()`（`React.lazy` + `Suspense`） |
| `<mat-icon>`（Material Symbols Outlined） | `MatIcon`（`src/components/shared/icons/mat-icon.tsx`） |
| `<app-svg-icon>` | `SvgIcon`（`src/components/shared/icons/svg-icon.tsx`。移植元の全アイコンを移植済み） |
| `<app-admin-page-shell>` | `AdminPageShell`（`src/components/layouts/admin-page-shell.tsx`） |
| AuthStore の `isAdmin`・`isGroupAdmin`・`isGroupAdminOnly`・`canAccessAdminConsole`・`adminGroupIds` | `useAuthStore` の同名の値 |
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

---

## ディレクトリ構造

ページ（ルート 1 つ分の画面）は `src/routes/` に **URL と同じ階層**で置く。移植元の `features/admin/management/*`（URL は `/admin/*`）は `src/routes/admin/*` になる。

```
src/
├── routes/                       # ページ（URL と同じ階層）
│   ├── index.tsx                 # ルート定義（全画面の枠を定義済み。画面の移植では触らない）
│   ├── guards.tsx                # 権限ガード（移植元 core/guards）
│   ├── auth/                     # /auth/login・/auth/password/reset
│   ├── admin/                    # /admin/*（管理コンソール。移植元 features/admin/management）
│   │   ├── users/  groups/  tenant/  chat-history/  assistants/  templates/  feedback/  training-data/
│   ├── chat/                     # /chat/new・/chat/assistant・/chat/:roomId・/chat/viewer/:chatId・/chat/share/:shareId
│   ├── library/                  # /library・/library/:id
│   ├── chat-shared-history/      # /chat-shared-history/:roomId
│   ├── feedback-preview/         # /feedback-preview/:roomId
│   ├── users/                    # /users*（旧ユーザー管理）
│   ├── reports/  settings/
├── components/
│   ├── features/<機能>/          # その画面・機能だけで使う部品（例: features/admin/users/user-table.tsx、features/chat/...）
│   ├── layouts/                  # 管理レイアウト・サイドバー・AdminPageShell・認証レイアウト
│   └── shared/                   # 複数画面で使う共通部品（共通 UI は #278）。icons/ に SvgIcon・MatIcon
├── hooks/                        # TanStack Query hooks（use-xxx.ts）
├── store/                        # Zustand stores
├── lib/
│   ├── api-client.ts             # fetch のラッパー
│   └── constants/                # routes.ts（ルート定数）・layout.ts（サイドバー設定）・api-paths.ts（API パス）
├── types/                        # 型定義（API レスポンス型等）
└── test/                         # テストの共通設定・ヘルパー（render-app.tsx）
```

### ルート・ガード・サイドバーの前提（#277 で定義済み）

- **全画面のパス・ルートの枠・ガードは `src/routes/index.tsx` に定義済み**。未移植の画面は `src/routes/**` の仮ファイル（`NotPortedPage` で「未移植: 〇〇Component（#Issue番号）」を表示）になっている
- ルート定数は `src/lib/constants/routes.ts` の `ROUTES`（移植元 `routes.config.ts` と同じ名前・同じ値）。遷移先は文字列を直書きせず `ROUTES.APP.ADMIN_GROUP_DETAIL(id)` 等を使う
- ガードの割り当ては移植元と同じ（`/admin/*` は `RequireAdminConsole`、テナント管理者だけの画面は `RequireTenantAdmin`、グループ詳細は `RequireGroupAccess`、旧ユーザー管理・レポート・設定は `RequireAdmin`）。画面の中で権限を見たいときは `useAuthStore` の `isAdmin`・`isGroupAdminOnly`・`adminGroupIds` 等を使う
- サイドバー（`src/components/layouts/sidebar.tsx`）のナビ項目・管理メニュー（権限別）・ユーザーメニューは定義済み。モード（通常・管理・戻る）は URL から決まる（`sidebar-mode.ts`）
- サイドバーから開くダイアログは仮ファイルになっている。担当はそのファイルだけを書き換える（`open`・`onClose` の props は変えない）
  - 新しいチャット: `src/components/features/chat/new-chat-dialog.tsx`（#284）
  - チャット検索: `src/components/features/chat/chat-search-modal.tsx`（#287）
  - クレジット確認: `src/components/layouts/usage-dialog.tsx`（担当未定）
- `AdminLayout` のモバイル用の開くボタン（`open-mobile-sidebar`）は移植元にない仮のもの。移植元どおりページヘッダー（#278 の `PageHeader`）に開閉ボタンが入ったら消す
- サイドバーは `/dashboard`・`/chat/new` へ移るたびに TanStack Query の `['assistants']`・`['prompt-templates']` を無効化する（移植元と同じ）。アシスタント一覧・テンプレート一覧の query key はこの 2 つを先頭にする
- 用語集（`/glossary` 配下）・データソースは移植元で非表示にした機能のため、ルートもサイドバー項目も作らない
- i18n 辞書（`public/i18n/ja.json`・`en.json`）は移植元を丸ごと移植済み。**画面の移植でキーを足さない**（移植元にないキーが必要なら、移植元の最新を確認し、辞書ごと移植元に揃える）。React 独自のキーは `AUTH.LOGIN.TENANT_ID_*` だけ

### 画面を足す（未移植の画面を移植する）手順

1. `src/routes/index.tsx` で担当画面のパスと import 先（仮ファイル）を確認する。**`routes/index.tsx`・`lib/constants/routes.ts`・`components/layouts/sidebar.tsx`・`lib/constants/layout.ts`・`public/i18n/*` は触らない**
2. 仮ファイル（例: `src/routes/admin/users/user-list.tsx`）の中身を本物に置き換える。**export 名（例: `AdminUserListPage`）は変えない**（`routes/index.tsx` が名前で遅延読み込みしているため）
3. 管理画面は `AdminPageShell` で包み、`header` に共通 UI（#278）の `PageHeader` を渡す（移植元の `<app-admin-page-shell [titleKey]="...">` に相当）

   ```tsx
   export function AdminUserListPage() {
     return (
       <AdminPageShell header={<PageHeader titleKey="ADMIN_CONSOLE.USER_MANAGEMENT" />}>
         ...
       </AdminPageShell>
     );
   }
   ```

4. その画面だけで使う部品は `src/components/features/<機能>/`、API 呼び出しは `src/hooks/use-xxx.ts`、型は `src/types/`、API パスは `src/lib/constants/api-paths.ts`（#279 で整備。足りなければ追加）に置く
5. 子ルートを持つ画面（グループ詳細のタブ）は、親の画面に `<Outlet />` を置く（子ルートは定義済み）
6. テストはページと同じ場所に `*.test.tsx` を置く。ガード・レイアウト込みで描画したいときは `src/test/render-app.tsx` の `renderApp(path)` と `setAuthUser(FIXTURE_TENANT_ADMIN)` 等を使う。`src/routes/index.test.tsx`・`guards.test.tsx` は画面の中身に依存しない（パスの一致と遷移先 URL だけを見る）ため直さなくてよい。ただし画面が描画時に API を呼ぶ場合、`guards.test.tsx` で MSW の未定義リクエストのエラーが出ることがあるので、そのときは `src/mocks/handlers/` に自分の API のハンドラーを足して `src/test/setup.ts` に登録する

全画面の移植が終わったら `src/components/layouts/not-ported.tsx` とそのテストを消す。

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
