# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue のドキュメントを追加する | `docs/issue-477/` |
| 2 | 共通のコンボボックスの `+N` の判定・開き直し・右の余白を直す | `combobox-multi.tsx`、`index.css`、`combobox-multi.test.tsx` |
| 3 | コンボボックスに、開いている間の高さ上限（`scrollChipsWhenOpen`）を足す | `combobox-multi.tsx`、`combobox-multi.test.tsx`、`shared/README.md` |
| 4 | 所属ユーザー追加を、名前で絞り込めるコンボボックスに置き換える | `group-detail-users.tsx`、`group-detail.test.tsx`、`ja.json`・`en.json` |
| 5 | 動作確認と code-review を記録する | `08_動作確認.md`、`code-review.md` |

## 各コミットメッセージ案

```
#477 issue-477 NAW-1452 Issue のドキュメントを追加する
    - 00_チケット内容.md〜07_gitコミット.md を作成する
```

```
#477 issue-477 NAW-1452 コンボボックスの +N の判定・開き直し・右の余白を直す
    - +N の判定を、毎回 1 つ目のチップの今の位置と比べる方式にする
    - 閉じている間に隠した入力欄とチップを、開くときに戻す
    - チップ欄の右の余白を広げ、最後のチップが区切り線と［▼］に重ならないようにする
```

```
#477 issue-477 NAW-1452 コンボボックスに、開いている間の高さ上限を足す
    - scrollChipsWhenOpen を足し、開いている間だけ高さ上限と中でのスクロールを付ける
    - 選ぶたびに末尾へスクロールし、一覧を欄の下端に付け直す
```

```
#477 issue-477 NAW-1452 チーム詳細の所属ユーザー追加を、名前で絞り込めるようにする
    - MultiSelect を ComboboxMulti に置き換える
    - 検索補足文の翻訳（ja・en）を足し、テストを書き直す
```

```
#477 issue-477 NAW-1452 動作確認と code-review を記録する
```
