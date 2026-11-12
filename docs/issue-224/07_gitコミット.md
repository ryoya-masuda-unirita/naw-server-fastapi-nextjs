# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを作成 | `docs/issue-224/00`〜`07` |
| 2 | SSE 組み立てと `textData` 解釈を共通化 | `backend/app/core/sse.py`、`backend/app/schemas/multipart_form.py`、`backend/app/schemas/message.py`、`backend/app/services/message_service.py`、`backend/tests/unit/test_sse.py` |
| 3 | 汎用チャット API のリクエスト形式と SSE 形式を移植元に揃える | `backend/app/schemas/llm.py`、`backend/app/schemas/attachment.py`、`backend/app/routers/llm.py`、`backend/app/services/llm_chat_service.py`、`backend/tests/unit/test_llm_chat_service.py`、`backend/tests/unit/test_llm_schemas.py`、`backend/tests/integration/test_llm_chat.py` |
| 4 | 動作確認結果を記録 | `docs/issue-224/06`・`08` |

## 各コミットメッセージ案

```text
#224 issue-224 設計ドキュメントを作成
    - docs/issue-224 に 00〜07 を追加
```

```text
#224 issue-224 SSE イベントの組み立てと textData パートの解釈を共通化
    - core/sse.py に sse_event を追加し、message_service の _sse を置き換え
    - schemas/multipart_form.py に parse_text_data_form を追加し、送信 API の textData 解釈を置き換え
```

```text
#224 issue-224 汎用チャット API のリクエスト形式と SSE 形式を移植元に揃える
    - multipart（textData・attachmentFiles）で受け取るように変更
    - 発話ごとの attachments で添付ファイルを紐付け、response_format の項目名を移植元に合わせる
    - 添付ファイル名の重複を入力エラーにする（移植元 @UniqueFileNames 相当）
    - SSE を data: {"type": ...} 形式に変更し、Azure・Bedrock 両経路の結合テストを追加
```

```text
#224 issue-224 動作確認結果を記録
    - 08_動作確認.md に自動テストの結果を記録
    - 05〜07 を実装に合わせて更新
```
