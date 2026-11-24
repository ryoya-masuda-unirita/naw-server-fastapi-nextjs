# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue のドキュメントを追加する | `docs/issue-490/` |
| 2 | 共通のメニュー・スイッチ・入力欄・ページ見出し・並び替えに、名前と役割を付ける | `context-menu.tsx`、`form-switch.tsx`、`form-input.tsx`、`page-header.tsx`、`form-sort-input.tsx`、翻訳、それぞれのテスト |
| 3 | 行メニューの項目を `menuitem` にする | 呼び出し側 8 か所と、そのテスト |
| 4 | 動作確認と code-review を記録する | `08_動作確認.md`、`code-review.md` |

メッセージは `#490 issue-490 …`（規約どおり）。実際のメッセージは `git log` を参照する。
