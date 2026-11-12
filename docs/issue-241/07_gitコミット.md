# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | フロントエンドの PR 用 CI を追加 | `.github/workflows/frontend-tests.yml`、`.github/workflows/deploy-frontend.yml`、`docs/issue-241/*` |
| 2 | （必要なら）code-review 結果の反映 | `docs/issue-241/code-review.md` ほか |

## 各コミットメッセージ案

```
#241 issue-241 フロントエンドのPR用CIを追加する
    - frontend/ に変更があるPR（develop/main 向け）と develop への push で lint・型チェック・テスト・ビルドを実行する frontend-tests.yml を追加
    - deploy-frontend.yml の「frontend のテストを実行するCIは他にない」というコメントを実態に合わせて修正
    - docs/issue-241 に 00〜08 を作成
```
