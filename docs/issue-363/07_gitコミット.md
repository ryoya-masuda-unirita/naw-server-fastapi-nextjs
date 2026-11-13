# 07 gitコミット

```
#363 issue-363 期間フィルターで日を選ぶと閉じてしまう問題を直す
    - 部品の外クリック判定を contains(event.target) から composedPath() に変更
    - 日のボタンが DOM から外れた後でも閉じないことの単体テストを追加
    - docs/issue-363 を追加
```
