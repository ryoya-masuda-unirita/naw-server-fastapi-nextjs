# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-150/` |
| 2 | backend開発用Dockerfileを追加 | `backend/Dockerfile.dev` |
| 3 | frontend-angular開発用Dockerfileとプロキシ設定の環境変数対応を追加 | `frontend-angular/Dockerfile.dev`, `frontend-angular/proxy.conf.local.js` |
| 4 | docker-composeにbackend・frontend-angularサービスを追加 | `docker-compose.yml` |

## 各コミットメッセージ案

```
#150 issue-150 docs/issue-150 のドキュメント一式を作成
    - 00_チケット内容〜07_gitコミットを作成し、backend・frontend-angularのdocker-compose化方針を記録
```

```
#150 issue-150 backend開発用Dockerfileを追加
    - ホットリロード対応のbackend/Dockerfile.devを新規作成
```

```
#150 issue-150 frontend-angular開発用Dockerfileとプロキシ設定の環境変数対応を追加
    - ホットリロード対応のfrontend-angular/Dockerfile.devを新規作成
    - proxy.conf.local.jsの転送先を環境変数で切り替え可能に変更
```

```
#150 issue-150 docker-composeにbackend・frontend-angularサービスを追加
    - backend・frontend-angularサービスを追加し、docker compose up一発でローカル開発環境が立ち上がるようにする
    - .venv・node_modulesは名前付きボリュームでホストのバインドマウントから分離する
```
