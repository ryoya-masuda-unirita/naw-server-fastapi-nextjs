# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | `00_チケット内容.md` を作成 | `docs/issue-97/00_チケット内容.md` |
| 2 | ドキュメント一式（01〜08）を作成 | `docs/issue-97/*.md` |
| 3 | メッセージ添付ファイル(attachmentFiles/historyAttachmentFiles)対応を実装 | `backend/app/schemas/attachment.py`, `backend/app/core/attachment_media.py`, `backend/app/core/llm_client.py`, `backend/app/schemas/llm.py`, `backend/app/schemas/message.py`, `backend/app/services/llm_chat_service.py`, `backend/app/services/message_service.py`, `backend/app/repositories/message_content_repository.py` |
| 4 | 添付ファイル対応のテストを追加 | `backend/tests/unit/test_attachment_media.py`, `backend/tests/unit/test_llm_chat_service.py`, `backend/tests/unit/test_message_service.py`, その他関連テスト |
| 5 | (必要な場合) code-review指摘の修正 | 指摘に応じて |

## 各コミットメッセージ案

```
#97 issue-97 00_チケット内容.md を作成
```

```
#97 issue-97 要件定義〜動作確認ドキュメント一式を作成
    - 01_要件定義.md〜08_動作確認.md を作成
```

```
#97 issue-97 メッセージ添付ファイル(attachmentFiles/historyAttachmentFiles)対応を実装
    - LlmChatRequest/MessageContentCreateRequestにattachmentFiles/historyAttachmentFilesを追加
    - 添付ファイルをLLM入力コンテンツに変換するbuild_user_contentを追加
    - ChatMessage.contentをマルチモーダル対応に拡張
    - POST /api/messages/contentで添付ファイルをmessage_filesに永続化するよう対応
```

```
#97 issue-97 添付ファイル対応の単体テストを追加
    - build_user_content・スキーマバリデーション・各serviceの分岐網羅テストを追加
```
