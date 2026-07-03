# code-review 結果

`/code-review`（high effort, recall-biased）を実行し、9件の指摘が検証を経て残った。いずれもユーザー判断により今回は対応せず、記録のみとする。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `frontend/src/components/layouts/sidebar.tsx` | モバイルドロワー内のリンクをタップして遷移しても、Angularにあった自動クローズ処理が移植されておらずドロワーが開いたまま残る | 対応しない |
| 2 | 🟡 注意 | `frontend/src/components/layouts/app-layout.tsx:15` | モバイルでドロワーを開くと、固定ハンバーガーボタンとサイドバーのロゴが視覚的に重なる | 対応しない |
| 3 | 🟡 注意 | `frontend/src/components/layouts/sidebar.tsx:33` | 折りたたみボタンの分岐がビューポート幅を見ておらず、モバイル操作後にリサイズすると1回分ズレる | 対応しない |
| 4 | 🟡 注意 | `frontend/src/components/layouts/sidebar.tsx:13` | 折りたたみ時の幅クラス`w-13`に`md:`指定がなく、折りたたみ+モバイルドロワーの組み合わせで52px幅のまま開く | 対応しない |
| 5 | 🔵 提案 | `frontend/src/components/layouts/app-layout.tsx:16` | アイコンのみボタンの`aria-label`が英語のままi18n化されていない（`ja.json`に`HEADER.SIDEBAR_TOGGLE`が既存） | 対応しない |
| 6 | 🔵 提案 | `frontend/src/components/layouts/app-layout.tsx:27` | モバイルオーバーレイの背景色`bg-black/50`が既存のデザイントークン`--color-bg-overlay`を使っていない | 対応しない |
| 7 | 🔵 提案 | `frontend/src/components/shared/user-menu.tsx:48` | 「外側クリックで閉じる」実装が`user-menu.tsx`と`app-layout.tsx`で共通化されず重複している | 対応しない |
| 8 | 🔵 提案 | `frontend/src/routes/index.test.tsx` | ルート`'/'`直下への直接アクセス時の挙動を検証するテストがない | 対応しない |
| 9 | 🔵 提案 | `frontend/src/components/shared/user-menu.tsx:34` | ログアウト確認が`window.confirm()`で、Angularのカスタムダイアログと見た目が異なる | 対応しない |

## 詳細

### 1〜4. サイドバー・モバイルドロワー関連の挙動不整合（🟡 注意）→ 対応しない

いずれもモバイル幅での操作やリサイズ・折りたたみとの組み合わせという特定条件下でのみ顕在化する。現状のスコープ（共通レイアウトの土台）における実害は限定的と判断し、モバイル向けヘッダー・ナビゲーション機能を実装する将来issueでまとめて手を入れる。

### 5〜9. i18n・デザイントークン・テストカバレッジ・実装重複・ダイアログ差異（🔵 提案）→ 対応しない

9番（`window.confirm`によるログアウト確認）は`03_詳細設計.md`の「設計上の判断・注意点」で汎用ダイアログ基盤の新設をスコープ外と明示済みの意図的な判断。5〜8番も同様に、現時点のスコープでは影響が軽微なため今回は見送り、将来の関連issue（ヘッダー実装・ダイアログ基盤整備等）で合わせて対応する。
