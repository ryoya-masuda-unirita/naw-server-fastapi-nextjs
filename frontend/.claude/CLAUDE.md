# frontend — Claude 向けプロジェクト設定

## 移植元リポジトリ

Angular 実装: `~/Documents/secuaigent-client`

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
