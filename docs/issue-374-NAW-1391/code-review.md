# code-review 結果

差分（`backend/app/core/vector_store.py`、`backend/tests/unit/test_vector_store.py`）を読んで確認した。🔴 致命的な指摘はなし。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/core/vector_store.py` | 要求 URL の取得に `getattr` を使っており、Azure SDK の response 構造が変わると 404 でも 0 件にならず 400 に倒れる | 対応しない |
| 2 | 🔵 提案 | `backend/app/core/vector_store.py` | 400 への変換が `HttpResponseError` と `ServiceRequestError` の 2 か所に重複 | 対応しない |

## 詳細

### 1. 要求 URL 取得の防御的な書き方（🟡 注意）→ 対応しない

response や request が欠ける場合は 0 件にせず 400（従来動作）に倒れるので安全側の挙動になる。意図した設計で、テスト（`test_raises_400_when_not_found_has_no_response`）で固定している。

### 2. 400 変換の重複（🔵 提案）→ 対応しない

2 つの except に分けたのは、`HttpResponseError` だけ 0 件の分岐を挟むため。共通化しても行数がほぼ減らず、読みやすさを優先した。
