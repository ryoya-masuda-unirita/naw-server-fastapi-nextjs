# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-282/00`〜`07` |
| 2 | ライブラリ本文取得 API | `backend/app/schemas/library.py`、`backend/app/services/library_service.py`、`backend/app/routers/libraries.py`、`backend/tests/unit/test_library_service.py`、`backend/tests/integration/test_libraries.py` |
| 3 | 動作確認の記録 | `docs/issue-282/06`・`08` |
| 4 | code-review の結果 | `docs/issue-282/code-review.md` |

## 各コミットメッセージ案

```text
#282 issue-282 移植元との突き合わせ結果と設計ドキュメントを作成
    - rooms/pinの一括・rooms/reorderが移植元serverに無いことを記載
    - ライブラリ本文取得の設計を記載
```

```text
#282 issue-282 ライブラリ本文取得APIを移植する
    - GET /api/libraries/{libraryId}/contentで本文を{"data": 本文}で返す
    - 閲覧判定をライブラリ取得と共通化する
    - 本文が無い場合は404 Library content not foundを返す
```
