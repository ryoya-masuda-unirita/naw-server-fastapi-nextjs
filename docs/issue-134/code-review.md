# code-review 結果

`/code-review medium 331` の結果。🔴（致命的）に当たるものはなし。いずれも移植元（Angular）の `chat-history.component`・`chat-history-filter`・`chat-history-list`・`chat-history.store`・`chat-history-api.service` が同じ作りで、目標が完璧なクローンのため変えない。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `chat-history.tsx` | 取得中は一覧とページャーをスピナーに差し替えるためちらつく | 対応しない（移植元の `isLoading` 分岐と同じ。#124・#136 も同じ作り） |
| 2 | 🔵 提案 | `chat-history-list.tsx` | `name` が null の行で詳細ボタンのアクセシブルネームが空になる | 対応しない（移植元は `[ariaLabel]="item.roomName"`。null は backend 由来のため空文字で吸収済み） |
| 3 | 🔵 提案 | `chat-history-filter.tsx` | ソートの `label for="chat-history-sort"` が指す要素がない | 対応しない（移植元も `id` を付けた `app-form-sort-input` ホストへの `label for` で、同じ紐付け） |
| 4 | 🟡 注意 | `use-chat-history.ts` | ユーザーの選択肢が最新 20 件の履歴からの推定のみ | 対応しない（移植元 `listUsers` の近似をそのまま移植。Issue 本文にも「後続で専用 API を検討」とある。03 に記載し申し送り） |
| 5 | 🔵 提案 | `chat-history-store.ts` | ページが `totalPages` を超えたときの補正がない | 対応しない（移植元にもなく、この画面に削除操作がないため通常起きない。03 に記載） |
| 6 | 🟡 注意 | `chat-history.tsx` | 取得失敗が 0 件表示と区別できない | 対応しない（移植元は失敗時 `items: []` で同じ。共通エラートーストは出る） |
| 7 | 🔵 提案 | `chat-history-filter.tsx` | フィルター状態がコンポーネントとストアに二重にある | 対応しない（移植元もフィルターコンポーネントの signal と store の `filter` で二重。構造を揃える） |

## 後続 Issue への申し送り

- 4: ユーザーの選択肢を専用 API（ユーザー一覧）から取る改善
- 1・6: 一覧の読み込み表示と取得失敗表示の改善（#124・#136 と共通の課題）
