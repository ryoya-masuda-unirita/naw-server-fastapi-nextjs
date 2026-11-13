# code-review 結果

差分（`period-filter.tsx` の 1 箇所とテスト 1 件）を自分でレビューした。🔴 は 0 件。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `frontend/src/components/shared/period-filter.test.tsx` | 追加テストは、ボタン自身のリスナーで `remove()` して実ブラウザの「DOM から外れた後に `document` へ届く」順序を再現している。jsdom（act 環境）では React の更新が溜まりこの順序にならず、`IS_REACT_ACT_ENVIRONMENT=false` でも再現しなかったため | 対応不要。修正前のコードで失敗すること、E2E（16-23・17-15）が OK になることで担保している |
| 2 | 🔵 提案 | `frontend/src/components/shared/period-filter.tsx` | モバイルのオーバーレイは `onClick` で `close()` と `stopPropagation()` を行うため `document` のリスナーを通らない。今回の変更の影響なし | 対応不要 |

## 確認したこと

- `composedPath()` は発火時点の経路を返すため、DOM から外れた要素でも部品の中のクリックと判定できる。部品の外のクリックは経路に `hostRef` が含まれず、従来どおり閉じる（既存テスト「部品の外をクリックすると閉じること」が通る）
- 使われなくなったコードはない
