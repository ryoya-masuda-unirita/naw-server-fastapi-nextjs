# code-review 結果

対象: PR #313（`/code-review medium 313`）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/assistant_category_service.py` | 同名の一意制約違反が未処理の `IntegrityError` のまま送出され、共通のエラー形式にならず CORS ヘッダーも無い 500 になる。ブラウザから状態コードを読めない | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/assistant_category_service.py` | 未処理の DB 例外に任せず、`AssistantService.delete_assistant` と同じく `IntegrityError` を捕捉して `HTTPException` にすべき | 対応済み（1 と同じ修正） |
| 3 | 🟡 注意 | `backend/app/services/assistant_category_service.py` | 説明を null・空白で送っても消せず、200 が返る | 対応しない（移植元どおり。docs に記載済み） |
| 4 | 🟡 注意 | `backend/app/services/assistant_category_service.py` 他 | docstring が backend の CLAUDE.md の Google 形式ではなく NumPy 形式 | 対応しない（ユーザー指示） |
| 5 | 🔵 提案 | `backend/app/services/assistant_category_service.py` | `_is_not_blank` が `AssistantService` のインライン判定と重複している | 対応済み |

## 詳細

### 1. 一意制約違反が CORS ヘッダーの無い 500 になる（🔴 致命的）→ 対応済み

FastAPI では、未処理の例外は最外周の `ServerErrorMiddleware` が応答を作るため、`CORSMiddleware` を通らず CORS ヘッダーが付かない。本文も共通のエラー形式（`timestamp`・`message`）ではなく平文になる。ブラウザからは CORS エラーに見え、状態コードを読めない。

作成・更新で `IntegrityError` を捕捉して `session.rollback()` し、`HTTPException(500, detail="Internal Server Error")` を送出するようにした。状態コードは移植元（`DataIntegrityViolationException` のハンドラが無く Spring Boot 既定の 500）と同じ 500、文言は Spring Boot 既定の本文の `error` と同じ `Internal Server Error` にした。結合テストで 500・`message`・DB が変わらないことを、単体テストでロールバックと変換を確かめる。

### 2. `IntegrityError` を `HTTPException` に変換すべき（🟡 注意）→ 対応済み

1 と同じ修正。状態コードは指摘の「チームが選ぶ状態」ではなく、移植元に合わせて 500 のままにした（目標が移植元の完璧なクローンのため）。

### 3. 説明を消せない（🟡 注意）→ 対応しない

移植元 `AssistantCategoryService#updateAssistantCategory` は `StringUtils.isNotBlank(description)` のときだけ上書きするため、移植元でも説明は消せない。この Issue はこの挙動に揃えることが目的で、`01_要件定義.md`・`02_基本設計.md` に記載済み。移植元クライアントの編集フォームにも説明を消す専用の操作は無い。

### 4. docstring の形式（🟡 注意）→ 対応しない

ユーザーの指示（今回の作業の追加ルール）で、追加・変更した関数と、触ったファイルの既存 docstring を NumPy 形式にしている。PR 本文に明記した。

### 5. `_is_not_blank` の重複（🔵 提案）→ 対応済み

`AssistantService` と同じ `if req.description and req.description.strip():` のインライン判定に変え、ヘルパーを削除した。共通化（`app/core` へ移す）は他のサービスにも手を入れることになり、この Issue の範囲を超えるため見送った。
