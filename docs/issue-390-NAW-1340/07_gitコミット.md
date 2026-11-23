# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 00〜07 のドキュメント | `docs/issue-390-NAW-1340/` |
| 2 | ローカル用サーバー向けの変換と通信（テスト付き） | `local-training-api-helper.ts`・`local-training-api.ts`・各テスト・型・API パス・フォルダ情報の変換 |
| 3 | 学習データ詳細の LOCAL の振り分けと更新者名 | `use-training-data-detail.ts`・`training-data-files-view.tsx`・モック・画面テスト |
| 4 | デモの接続先と手順 | `server/seed-demo.sql`・`README.md` |
| 5 | 動作確認の記録と code-review.md | `08_動作確認.md`・`code-review.md` |

## 各コミットメッセージ案

```text
#390 issue-390 NAW-1340 ローカル用サーバーへの送り分けの設計ドキュメントを作成
    - 00〜07 を追加

#390 issue-390 NAW-1340 ローカル用サーバーへ送る変換と通信処理を追加する
    - 接続先の URL 結合・期間の日付変換・送る内容の組み立てと、一覧・追加・更新・削除・同期を追加
    - 接続先はキャッシュせず操作のたびに取得し、取れないときは送らずに失敗させる

#390 issue-390 NAW-1340 ローカルの学習先フォルダの操作をローカル用サーバーへ振り分ける
    - 一覧・追加・更新・削除・同期を、フォルダの種類が LOCAL のときだけ振り分ける
    - ローカルの更新者名を loginIds で引く

#390 issue-390 NAW-1340 デモのローカルの学習先フォルダを server-local につなぐ
    - seed-demo.sql の接続先を更新し、README に手順を追加

#390 issue-390 NAW-1340 動作確認の結果を記録
    - 08_動作確認.md と code-review.md を追加
```
