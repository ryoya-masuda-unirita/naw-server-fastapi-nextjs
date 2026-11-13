# code-review 結果

差分（`origin/develop...HEAD`）を自分でレビューした結果（`/code-review` は実行していない）。🔴 に当たるものはなかった。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `components/layouts/sidebar.tsx` | 削除・名前変更が失敗したときの扱いが移植元と違う（ダイアログを開いたままにしてログを出す） | 対応しない |
| 2 | 🟡 注意 | `components/layouts/sidebar/sidebar-route-button.tsx` | ルーム名を翻訳しない（移植元は翻訳パイプに通す） | 対応しない |
| 3 | 🟡 注意 | `components/layouts/sidebar.tsx` | マウントのたびに `GET /api/rooms` を呼ぶ（Sidebar は AdminLayout に 1 つ） | 対応しない |
| 4 | 🔵 提案 | `components/layouts/sidebar/chat-sort-dialog.tsx`・`chat-delete-dialog.tsx`・`chat-context-menu.tsx` | 画面から開けない部品（移植元と同じ） | 対応しない |
| 5 | 🔵 提案 | `components/layouts/sidebar/use-floating-menu.ts` | モバイルの閉じるアニメーションは `animationend` 頼みで、自動テストでは確認できない | 対応しない |

## 詳細

### 1. 失敗時の扱い（🟡）→ 対応しない

移植元は `.then` だけで `catch` が無く、確認ダイアログのローディングが戻らず固まる。固まるのは明らかな不具合で、エラートーストは api-client が出すため、React ではログを出してダイアログを開いたまま、ローディングを戻した。`02_基本設計.md` の差分 4 に記載。

### 2. ルーム名を翻訳しない（🟡）→ 対応しない

ルーム名は i18n キーではない。react-i18next の `t('A: メモ')` は `:` を名前空間区切りとして扱い、表示が壊れる。通常の名前では見た目は同じ。`02_基本設計.md` の差分 1 に記載。

### 3. 一覧の読み込み回数（🟡）→ 対応しない

移植元も `SidebarComponent` のコンストラクタで 1 回呼ぶ。React では AdminLayout が常駐するので、ページ遷移では再読み込みされない（`useEffect` の依存は空）。StrictMode の開発時のみ 2 回呼ばれる。

### 4. 画面から開けない部品（🔵）→ 対応しない

移植元でも `openChatMenu`・`openSortDialog` を呼ぶ箇所がない（`grep -rn "openChatMenu\|openSortDialog" client/src/app` で定義とテストのみ）。依頼の「並び替え」はこの部品を指すと解釈して移した。開く口を作るかは別途の判断（`features/chat/README.md` に記載）。

### 5. モバイルのアニメーション（🔵）→ 対応しない

jsdom は CSS アニメーションを実行しないためデスクトップ幅のみテストした。`08_動作確認.md` の未確認事項に記載。
