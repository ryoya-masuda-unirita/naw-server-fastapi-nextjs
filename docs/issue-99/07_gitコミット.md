# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式（00〜08）を作成 | `docs/issue-99/*` |
| 2 | ライブラリ生成の共有ユーティリティ・固定システムプロンプトのマスタデータを追加 | `app/core/library_stream_router.py`, `app/models/system_prompt_template.py`, `app/repositories/system_prompt_template_repository.py`, `alembic/versions/022_add_system_prompt_templates.py` |
| 3 | LLM Chat API・メッセージ送信APIに`createLibrary`対応を実装 | `app/schemas/llm.py`, `app/schemas/message.py`, `app/services/llm_chat_service.py`, `app/services/message_service.py` |
| 4 | テストを追加 | `tests/unit/test_library_stream_router.py`, `tests/unit/test_llm_chat_service.py`, `tests/unit/test_message_service.py`, `tests/integration/test_system_prompt_templates.py` |

## 各コミットメッセージ案

```
#99 issue-99 00〜08ドキュメントを作成
    - ライブラリ生成(createLibrary)対応の要件定義・基本設計・詳細設計を作成
```

```
#99 issue-99 ライブラリ生成の共有ユーティリティと固定システムプロンプトを追加
    - マーカー区切りストリームルーター(LibraryStreamRouter)を追加
    - system_prompt_templatesテーブル・モデル・シードを追加
```

```
#99 issue-99 LLM Chat API・メッセージ送信APIにライブラリ生成(createLibrary)対応を実装
    - createLibrary/isCreateLibraryフラグでライブラリ生成モードに切り替え可能にする
    - library_title_delta/library_content_deltaイベントのストリーミング配信を実装
    - 生成完了後にライブラリを新規永続化する処理を実装
```

```
#99 issue-99 ライブラリ生成対応のテストを追加
    - LibraryStreamRouterの単体テストを追加
    - LLM Chat API・メッセージ送信APIのライブラリ生成モードのテストを追加
```
