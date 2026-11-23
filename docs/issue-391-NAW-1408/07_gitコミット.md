# 07_gitコミット

| # | 内容 | 対象 |
|---|---|---|
| 1 | ドキュメント | `docs/issue-391-NAW-1408/` |
| 2 | 実装とテスト | `client/src/**` |
| 3 | 動作確認の記録・code-review.md | `08_動作確認.md`・`code-review.md` |

```text
#391 issue-391 NAW-1408 追加学習をローカルの学習先フォルダではローカル用サーバーへ送る
    - フォルダを都度取り、LOCAL ならローカル用サーバーへ feedbackId か roomId のどちらか一方を送る
    - ユーザー ID・接続先が取れないときは送らず失敗させ、エラーを表示する
    - viaLocalServer と requireUserId を共有モジュールへ移す
```
