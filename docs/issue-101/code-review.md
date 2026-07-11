# code-review 結果

`/code-review`（medium）を実行し、8つの視点（line-by-line差分・削除挙動監査・呼び出し元/呼び出し先追跡・再利用・簡略化・効率・アーキテクチャ深度・CLAUDE.md規約）でサブエージェントによる調査を行った。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/message_service.py`（`event_stream`のfinally節） | 再生成対象がストリーミング中に削除される稀な競合時、`_persist_message_content`が送出する`ValueError`がfinally節の途中で伝播し、トークン使用量の永続化・completeイベント送出が行われないままジェネレータが異常終了する | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/message_service.py`（旧: `assert req.messageId is not None`） | 型narrowing目的の`assert`が本番コードのフロー制御を兼ねており、`-O`実行時に無効化され得る | 対応済み |
| 3 | 🟡 注意 | `backend/app/repositories/message_content_repository.py`（`update_answer`） | 再生成がエラーで終わった場合、既存の正常な回答が空文字列（またはエラー直前までの部分回答）で上書きされる | 対応しない |
| 4 | 🔵 提案 | `backend/app/schemas/message.py`（`_validate_target_specified`） | `messageId`・`messageContentId`が両方指定された場合にエラーとせず、`messageContentId`を優先して処理する（明示的な拒否をしない） | 対応しない |
| 5 | 🔵 提案 | `backend/app/services/message_service.py`（`question_text`） | 再生成時、LLMへの入力は`req.userInput`だが永続化される`question`は既存の質問文のまま。挙動としては意図通りだが、コード内コメント以外に明示されていない | 対応しない |
| 6 | 🔵 提案 | `backend/app/repositories/message_content_repository.py`（`update_answer`） | `save`と`update_answer`で`session.add`/`commit`/`refresh`の3行が重複している | 対応しない |
| 7 | 🔵 提案 | `backend/app/services/message_service.py`（`_persist_message_content`の`question`引数） | 再生成分岐（`existing_content_id`指定時）では`question`引数が`update_answer`に渡されず実質未使用になる | 対応しない |
| 8 | 🔵 提案 | `backend/app/services/message_service.py`（`stream_message_content`全体のアーキテクチャ） | 再生成ロジックが新規作成ロジックの上にnullableな分岐として積まれており、既存行の取得（リクエストスコープの`session`）と更新（新規セッション）の間に楽観ロックがなく、同時再生成リクエストが競合し得る（Java版と同様のTOCTOU） | 対応しない |

## 詳細

### 1. finally節での`ValueError`伝播によるストリーム異常終了（🟡 注意）→ 対応済み

`_persist_message_content`は、`existing_content_id`指定時に対象の`MessageContent`が見つからない場合（ストリーミング開始時点では存在確認済みのため、開始後に別リクエストで削除される等の稀な競合でのみ発生）`ValueError`を送出する設計にしていた。この呼び出しは`event_stream`の`finally`節内にあり、例外がそのまま伝播すると、後続の`_persist_token_usage`（トークン使用量の永続化）や`complete`イベントの送出が行われないままジェネレータが異常終了し、クライアントへの応答が中途半端に打ち切られる。

`_persist_message_content`の呼び出しを`try/except ValueError`で囲み、例外発生時はログを残した上で`content_response = None`として後続処理（トークン使用量の永続化）を継続するよう修正した。`complete`イベントは`content_response`がある場合のみ送出する。

```python
try:
    content_response = await MessageService._persist_message_content(...)
except ValueError:
    logger.exception("メッセージ内容の永続化に失敗しました")
    content_response = None
await MessageService._persist_token_usage(...)
if stream_finished and content_response is not None:
    yield _sse("complete", content_response.model_dump())
```

### 2. 型narrowing目的の`assert`（🟡 注意）→ 対応済み

`messageId`が`None`でないことをmypyに伝えるためだけに`assert req.messageId is not None`を使っていたが、Pythonの`assert`は`-O`（最適化）フラグ付き実行時に丸ごと無効化される。実際には`MessageContentCreateRequest`の`model_validator`によってこの不変条件は保証されているため実害は薄いが、ユーザーのグローバル規約（Javaにおける「型キャストの乱用」を避ける方針、およびこのリポジトリの「エラー処理は明示的に書く」方針）に合わせ、`assert`を明示的な`if req.messageId is None: raise HTTPException(400, ...)`に置き換えた。

### 3. 再生成失敗時の回答上書き（🟡 注意）→ 対応しない

再生成がエラーで終わった場合、`update_answer`は`answer`をそのまま（エラー時は空文字列または途中まで配信済みの部分回答）で上書きするため、直前まで存在した正常な回答が失われる。これは移植元Spring Boot（`MessageService.persistMessageContent`）の`oldMessageContent`分岐も全く同じ挙動（エラー時も`answer`・`status`を無条件に上書き）であり、`01_要件定義.md`で明記した「移植元の設計方針をそのまま踏襲する」という本Issueのスコープに沿っている。UXとしての改善余地（例: 失敗時は元の回答を保持する）はあるが、移植範囲を超える仕様変更になるため本Issueでは対応しない。

### 4. `messageId`・`messageContentId`同時指定時の挙動（🔵 提案）→ 対応しない

現在は両方指定時に`messageContentId`を優先して処理し、エラーにはしない。これは移植元Java（`if (vm.messageContentId() != null) { ... }`で無条件に`messageContentId`を優先）と同じ優先順位であり、意図的にJavaの挙動を踏襲している。よりクライアントに親切な実装として「両方指定時は400にする」という改善も考えられるが、移植範囲を超えるため対応しない。

### 5. 永続化される`question`とLLM入力の乖離（🔵 提案）→ 対応しない

再生成時、LLMへの入力は`req.userInput`だが、永続化・レスポンスされる`question`は既存の質問文のままという挙動は、`01_要件定義.md`・コード内コメントの両方に明記済みであり、移植元Javaの`persistMessageContent`と同じ仕様。OpenAPIスキーマのdocstringにも記載しているため、これ以上の追加ドキュメント化は不要と判断した。

### 6. `save`と`update_answer`の重複（🔵 提案）→ 対応しない

`MessageContentRepository.save`と`update_answer`はどちらも末尾で`session.add`・`commit`・`refresh`の3行を行っており重複しているが、それぞれ新規作成／更新という異なる目的のメソッドであり、共通化すると却って「新規作成なのか更新なのか」が呼び出し元から読み取りにくくなる。3行程度の軽微な重複であり、可読性を優先して現状維持とした。

### 7. `_persist_message_content`の`question`引数が再生成時に未使用（🔵 提案）→ 対応しない

再生成分岐（`existing_content_id`指定時）では`question`引数は`update_answer`に渡されず実質使われない。ただし、呼び出し元では「新規作成時のみ有効」という制約をdocstringに明記済みであり、分岐によって呼び出しシグネチャを変える（例: 新規作成用と更新用でメソッドを分ける）と、単一の`_persist_message_content`にまとめた設計（ストリーミング完了後の永続化ロジックを1箇所に集約する）の見通しがかえって悪くなるため、現状の設計を維持した。

### 8. 再生成ロジックのアーキテクチャ配置とTOCTOU（🔵 提案）→ 対応しない

再生成ロジックは既存の新規作成ロジックにnullableな分岐として重ねる形で実装しており、`messageContentId`存在確認（リクエストスコープの`session`）と実際の更新（ストリーミング完了後の新規セッション）の間に楽観ロックがないため、同一`messageContentId`に対する同時再生成リクエストが競合するとLast-Write-Winsになる。これは移植元Spring Boot（`TransactionTemplate`によるREQUIRES_NEWでの独立永続化、楽観ロックなし）と全く同じ設計であり、本Issueのスコープ（移植元の設計方針の踏襲）を超える改善のため対応しない。将来的に同時実行制御が必要になった場合は、`MessageContent`に`version`カラムを追加した楽観ロック導入を別Issueとして検討する。
