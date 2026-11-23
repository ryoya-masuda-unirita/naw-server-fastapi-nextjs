# code-review 結果

差分（`schemas/token_usage.py`・`services/token_usage_service.py`・結合テスト）を自分でレビューし、移植元の `TokenUsage.resolveUsageUser`・`TokenUsageService.listTokenUsage` と突き合わせた。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/schemas/token_usage.py` | `from_token_usage` の引数が増え、呼び出し側でユーザー辞書を渡す必要がある | 対応しない |
| 2 | 🔵 提案 | `backend/tests/integration/test_token_usage.py` | サービス単体のユニットテストがない | 対応しない |

🔴 致命的は 0 件。

## 詳細

### 1. `from_token_usage` の引数追加（🟡）→ 対応しない

呼び出し元は一覧のサービス 1 か所のみで、他に参照はない。移植元もレスポンス組み立て時に利用者を渡す作りで、同じ形。

### 2. ユニットテストなし（🔵）→ 対応しない

移植元の判定規則（SYSTEM / ACTIVE / DELETED）と他テナントの分離は、結合テスト 5 件で実 DB に対して確認している。既存のこのサービスも結合テスト中心。

### 確認した点

- 他テナントのユーザー名を返さない（`find_by_ids` がテナントを条件に含む）
- ユーザーの取得はページごとに 1 回（N+1 なし）
- 既存のフィールド・ページング・並び替えは変更なし
