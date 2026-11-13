# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | デモ環境の compose と frontend の開発サーバーのイメージを追加 | `docker-compose.demo.yml`、`frontend/Dockerfile.dev`、`frontend/Dockerfile.dev.dockerignore` |
| 2 | seed.sql のライブラリを library_contents に合わせ、デモデータを追加 | `backend/seed.sql`、`backend/seed-demo.sql` |
| 3 | README と docs を追加 | `README.md`、`docs/issue-336/` |

## 各コミットメッセージ案

```
#336 issue-336 デモ環境の compose と frontend の開発サーバーのイメージを追加
    - docker-compose.demo.yml を追加（postgres・redis・localstack・migrate・seed・backend・frontend）
    - frontend/Dockerfile.dev を追加
```

```
#336 issue-336 seed.sql を library_contents に合わせデモデータを追加
    - seed.sql のライブラリの INSERT を libraries と library_contents に分ける
    - backend/seed-demo.sql を追加
```

```
#336 issue-336 README にデモ環境の手順を追加しdocsを作成
    - README の先頭に起動・停止・ログイン情報・画面の一覧を追加
    - docs/issue-336 を追加
```
