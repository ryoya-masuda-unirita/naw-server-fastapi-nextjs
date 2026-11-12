# code-review 結果

PR #222 に対して `/code-review high 222` を実行した結果と対応。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `server-local/app/services/file_service.py` | ファイル差し替え（PATCH）で削除を先にコミットするため、再登録に失敗するとファイルとパートが消えたままになる | 対応済み |
| 2 | 🔴 致命的 | `server-local/app/services/file_service.py` | SQL の一括削除ではセッション内に削除済みパートが残り、同じパート ID の再登録で INSERT されないおそれ | 対応済み |
| 3 | 🟡 注意 | `server-local/app/services/message_content_stream_service.py` | SSE 準備でレコードをコミットしてからストリームファイルを作るため、作成失敗時に仮レコードが残り同じ messageId で再試行できない | 対応済み |
| 4 | 🟡 注意 | `server-local/app/services/file_service.py` | 同期で既存・重複パート ID があると IntegrityError（移植元は merge で上書き） | 対応済み |
| 5 | 🟡 注意 | `server-local/app/clients/waha_client.py` | textData.json の本文（NAW のアクセストークンを含む）を INFO ログに出している | 対応済み |
| 6 | 🟡 注意 | `server-local/app/services/file_service.py` | 既存ファイルの再登録で user_id を上書きしている（移植元は updatable=false） | 対応済み |
| 7 | 🟡 注意 | `server-local/app/routers/messages.py` | 使わない履歴の添付ファイルをメモリに全部読み込んでいる | 対応済み |
| 8 | 🟡 注意 | `server-local/app/routers/messages.py` | 自前で解析した multipart フォームを閉じていない（一時ファイルが残る） | 対応済み |
| 9 | 🔵 提案 | `server-local/app/services/message_content_stream_service.py` | ミリ秒→秒の換算に `1000` を直書きしている | 対応済み |
| 10 | 🔵 提案 | `server-local/app/services/message_content_stream_service.py` | 番兵の投入を `contextlib.suppress(Exception)` で握り潰している | 対応済み |

## 詳細

### 1. 差し替え時の削除が先にコミットされる（🔴 致命的）→ 対応済み

移植元は `updateFile` 全体が 1 つの `@Transactional` で、再登録に失敗すると削除もロールバックされる。削除処理（`_run_waha_delete`）に `commit` 引数を追加し、差し替えでは `commit=False` で削除を flush だけして、再登録（`_save`）と同じトランザクションでコミットするようにした。再登録が失敗した場合はセッションがコミットされずに閉じられ、削除も取り消される。

回帰テスト `test_update_with_file_rolls_back_delete_on_failure` を追加（修正前のコードでは失敗することを確認済み）。

### 2. 削除済みパートがセッションに残る（🔴 致命的）→ 対応済み

物理削除を SQL の一括 DELETE（+ 外部キーの ON DELETE CASCADE）から、ORM の `session.delete()` に変更し、パートを flush してからファイルを削除するようにした。セッション内の状態と DB が一致するため、同じ ID で再登録しても INSERT される。使われなくなった `file_repository.delete_by_id` は削除した。

回帰テスト `test_update_with_same_ids_recreates_parts` を追加。なお、修正前のコードでもこのテストは通った（SQLAlchemy の identity map は弱参照のため、パートへの参照が切れると DB から読み直される）。参照が残るタイミング次第で起きうるため、予防として修正した。

### 3. SSE 準備で仮レコードが残る（🟡 注意）→ 対応済み

ストリームファイルの作成をコミットの前に移した。作成に失敗するとコミットされず、`message_id`（一意制約）の仮レコードが残らない。回帰テスト `test_prepare_stream_file_failure_leaves_no_record` を追加。

### 4. 同期で既存・重複パート ID があると失敗する（🟡 注意）→ 対応済み

パートの保存を `_upsert_part`（既存なら file_id・tenant_id を上書き）にまとめ、`_save` と同期の両方で使うようにした。TSV 内の重複は `dict.fromkeys` で除いた。回帰テスト `test_sync_merges_duplicate_and_existing_parts` を追加（修正前は IntegrityError で失敗することを確認済み）。

### 5. アクセストークンのログ出力（🟡 注意）→ 対応済み

移植元は textData.json を本文ごとログに出しているが、トークンが漏れると NAW API を利用者として呼べてしまう。Waha! クライアントでの本文ログをやめ、SSE サービス側で `accessToken` を `***` に置き換えてからログに出すようにした（Waha! には元の値を送る）。回帰テスト `test_access_token_is_not_logged` を追加。

### 6. 再登録で user_id を上書きする（🟡 注意）→ 対応済み

`_save` で user_id を新規作成時にだけ設定するようにした（移植元の `updatable = false` と同じ）。回帰テスト `test_upload_existing_file_keeps_user_id` を追加（修正前は失敗することを確認済み）。

### 7. 履歴の添付ファイルを読み込んでいる（🟡 注意）→ 対応済み

履歴の添付ファイルは移植元でも Waha! に送らずログにサイズを出すだけのため、中身を読まずに名前とサイズだけを持つ `FileSummary` に変えた。

### 8. multipart フォームを閉じていない（🟡 注意）→ 対応済み

`_parse_message_request` で読み終えたら `finally` で `form.close()` するようにした。

### 9. `1000` の直書き（🔵 提案）→ 対応済み

`MS_PER_SECOND` を `app/core/config.py` に移し、`main.py` と SSE サービスで共通に使うようにした。

### 10. 番兵投入の握り潰し（🔵 提案）→ 対応済み

キューは上限なしで `put_nowait` が失敗しないため、`contextlib.suppress` を外した。

## 対応後のテスト結果

```
$ cd server-local && uv run pytest -q -W error::sqlalchemy.exc.SAWarning
119 passed in 2.90s
$ uv run ruff check . && uv run ruff format --check .
All checks passed!
57 files already formatted
```
