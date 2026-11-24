# 07_gitコミット

## コミット分割案

実装で、共通部品の変更とテストが同じファイルの中で絡み合うため、案を変えて 2 つにまとめた。

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue のドキュメントを追加する | `docs/issue-477/` |
| 2 | 共通のコンボボックスの `+N` の判定・開き直し・右の余白を直し、開いている間の高さ上限を足す | `combobox-multi.tsx`、`index.css`、`combobox-multi.test.tsx`、`shared/README.md` |
| 3 | 所属ユーザー追加を、名前で絞り込めるコンボボックスに置き換える | `group-detail-users.tsx`、`group-detail.test.tsx`、`ja.json`・`en.json` |
| 4 | 動作確認と code-review を記録する | `08_動作確認.md`、`screenshots/`、`code-review.md` |

## 各コミットメッセージ案

実際のメッセージは `git log` を参照する。
