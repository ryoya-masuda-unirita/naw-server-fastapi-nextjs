# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs 00〜07 を作成 | `docs/issue-213/` |
| 2 | frontend-angular と同期スキルを削除 | `frontend-angular/`、`.claude/skills/frontend-angular-sync/`、`.codex/skills/frontend-angular-sync/` |
| 3 | dev 環境のフロントのデプロイを React に切り替え | `.github/workflows/`、`frontend/.env.production`、`frontend/src/lib/api-client*.ts`、`infra/cloudfront.tf` |
| 4 | ローカル開発設定・backend から frontend-angular 前提を外す | `docker-compose.yml`、`.claude/launch.json`、`backend/` |
| 5 | ドキュメント・AI 設定から frontend-angular 前提を外す | CLAUDE.md、AGENTS.md、README、infra/README、agents、skills |
| 6 | 動作確認結果を記録 | `docs/issue-213/06`・`08` |
| 7 | code-review 結果を記録（指摘対応を含む） | `docs/issue-213/code-review.md` ほか |

## 各コミットメッセージ案

```
#213 issue-213 docs 00〜07 を作成
    - frontend-angular 削除と dev 環境フロントの React 切り替えの要件・設計・テスト設計を記載
```

```
#213 issue-213 frontend-angular と同期スキルを削除
    - frontend-angular/（e2e を含む）を削除
    - .claude・.codex の frontend-angular-sync スキルを削除
```

```
#213 issue-213 dev環境のフロントのデプロイをReactに切り替え
    - deploy-frontend-angular.yml を deploy-frontend.yml にして frontend/ をビルド・配信
    - .env.production で API を相対パスにし、api-client を相対パスの URL 組み立てに対応
    - CloudFront で 405 を index.html に置き換え /auth/login の画面表示を可能に
```

```
#213 issue-213 ローカル開発設定とbackendからfrontend-angular前提を外す
    - docker-compose の frontend-angular サービスを削除
    - launch.json を React 開発サーバーに置き換え
    - CORS 許可オリジン例から 4201 を外し、コメントを移植元クライアント基準に修正
```

```
#213 issue-213 ドキュメントとAI設定からfrontend-angular前提を外す
    - backend の動作確認を自動テストまたは React の移植済み画面で行う方針に変更
    - テナント識別方式の説明を React の現状に合わせて更新
```
