# 07_gitコミット

## コミット分割案

### 1. サイドバーのUI状態管理を追加

```
#17 issue-17 サイドバーの折りたたみ・モバイル表示の状態管理を追加
    - src/store/ui-store.ts を新規作成（sidebarCollapsed・sidebarMobileOpen）
    - src/store/ui-store.test.ts を追加
```

### 2. 共通レイアウト（AppLayout・Sidebar・UserMenu）を実装

```
#17 issue-17 ログイン後の共通レイアウト（AppLayout・Sidebar・UserMenu）を実装
    - src/types/layout.ts・src/lib/constants/layout.ts を新規作成
    - src/components/layouts/sidebar.tsx を新規作成
    - src/components/shared/user-menu.tsx を新規作成（パスワード設定・ログアウト導線）
    - src/components/layouts/app-layout.tsx を新規作成
    - public/icons/default-avt-icon.svg をAngular実装からコピー
    - 上記コンポーネントのテストを追加
```

### 3. ダッシュボードのプレースホルダー画面とルーティングを追加

```
#17 issue-17 ダッシュボードのプレースホルダー画面とルーティングを追加
    - src/routes/app/dashboard.tsx を新規作成
    - src/routes/index.tsx を拡張し、/dashboard を AppLayout 配下のネストルートとして追加
    - src/routes/app/dashboard.test.tsx・src/routes/index.test.tsx を追加
```

### 4.（動作確認・code-review対応後）必要に応じて追加コミット

指摘対応の内容に応じてコミットメッセージを都度作成する。

## 補足

- `docs/issue-17/00_チケット内容.md`〜`07_gitコミット.md` は既に個別コミット済み・プッシュ済みのため、実装コミットには含めない
- コミット・プッシュはユーザーの承認を得た後にのみ行う
