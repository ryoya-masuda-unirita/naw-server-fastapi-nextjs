# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-113/*` |
| 2 | 実装・テスト修正 | `backend/app/services/assistant_service.py`, `backend/tests/integration/test_assistants.py` |

## 各コミットメッセージ案

```
#113 issue-113 00_チケット内容.md を作成
```

```
#113 issue-113 アシスタント削除時、デフォルトアシスタント使用中なら409を返す
    - delete_assistantのIntegrityError捕捉時のレスポンスを400から409に変更
    - エラーメッセージを移植元AssistantInUseExceptionの文言に統一
    - 対応する統合テストを409仕様に更新
```
