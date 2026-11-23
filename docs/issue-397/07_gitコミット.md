# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを作成する | `docs/issue-397/` |
| 2 | e2e-spec の並列数の既定を 2 に下げる | `e2e-spec/playwright.config.ts`・`e2e-spec/README.md` |
| 3 | vitest の非同期待ちの上限を伸ばす | `client/src/test/setup.ts` |
| 4 | 切り分けで見つかった個別の修正（あれば） | `e2e-spec/tests/`・`server/` |
| 5 | 動作確認の結果を記録する | `docs/issue-397/08_動作確認.md` |

## 各コミットメッセージ案

```text
#397 issue-397 e2e-spec の並列数の既定を 2 に下げる
    - 4 並列では backend の負荷で要素待ちのタイムアウトや 500 が出るため
    - README の既定値の表記を合わせる
```
