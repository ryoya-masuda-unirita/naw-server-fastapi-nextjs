# code-review 結果

PR #269 に対して `/code-review` を実行した結果と対応。🔴 致命的の指摘はなかった。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `server-local/app/core/middleware.py` | Content-Type を大文字小文字を区別して判定しており、`Multipart/Form-Data` でサイズ上限をすり抜けられる | 対応済み |
| 2 | 🟡 注意 | `server-local/docker-entrypoint.sh` | WARN 以外の移植元のレベル名（TRACE・FATAL・OFF）だと起動に失敗する | 対応済み |
| 3 | 🟡 注意 | `server-local/app/routers/indexes.py` | 移植元は `user_id` が更新されない列のため、既存ファイルの更新になる場合は userId なしでも成功する。一律に 400 にしている | 対応済み |
| 4 | 🔵 提案 | `server-local/app/services/message_content_stream_service.py` | tail の読み取りをスレッドにしたことで、2 つのタスクが同時に確定処理に入れる | 対応済み |
| 5 | 🔵 提案 | `server-local/app/routers/indexes.py` | 差し替えの判定をルーターとサービスで重複して持ち、必須項目の確認も分散している | 一部対応 |
| 6 | 🔵 提案 | `server-local/app/routers/messages.py` | 415 にした multipart 判定も大文字小文字を区別している | 対応済み |
| 7 | 🔵 提案 | `server-local/app/core/errors.py` | 500 の組み立てとログがミドルウェアと汎用ハンドラーで重複している | 対応済み |
| 8 | 🟡 注意 | `server-local/app/services/file_service.py` | 同期の userId 確認が Waha! の処理の後で、README の「Waha! を呼ぶ前」と食い違う | 対応済み（README を修正） |
| 9 | 🔵 提案 | `server-local/app/services/message_content_stream_service.py` | ポーリングのたびにスレッドへ切り替える。`exists`/`stat` はイベントループ上のまま | 対応しない |
| 10 | 🔵 提案 | `server-local/alembic/versions/issue253_file_parts_file_id_index.py` | リビジョン ID が既存の連番（0001）と違う | 対応しない |

## 詳細

### 1・6. Content-Type の大文字小文字（🟡・🔵）→ 対応済み

サイズ上限のミドルウェアと質問 API の判定の両方で、Content-Type を小文字にしてから比べるようにした（Spring の MediaType・Starlette の解析と同じく大文字小文字を区別しない）。

### 2. LOG_LEVEL の他のレベル名（🟡 注意）→ 対応済み

entrypoint で `fatal`・`off` も `critical` に読み替える（uvicorn は `trace` を受け付ける）。アプリ側も `Settings.log_level` の `field_validator` で `TRACE`→`DEBUG`、`WARN`→`WARNING`、`FATAL`・`OFF`→`CRITICAL` に読み替えるようにした（Python の logging はこれらを知らず `basicConfig` が失敗するため）。テストに TRACE・FATAL・OFF を加え、Docker で `WARN`・`TRACE`・`OFF` の起動を確認した。

### 3. userId の扱い（🟡 注意）→ 対応済み

`userId` の確認をルーターから `_save()` の新規作成の分岐に移し、移植元と同じく新しくファイルを作るときだけ 400 にする（Waha! が既存のファイル ID を返した場合は成功し、登録者は変えない）。`name` は保存のたびに更新される列で必ず失敗するため、Waha! を呼ぶ前の確認を残した。`test_upload_existing_file_without_user_id` を追加し、userId の各テストを新しい挙動（Waha! の後に 400、DB は変更しない）に合わせた。

### 4. 確定処理の同時実行（🔵 提案）→ 対応済み

`StreamRuntime.finalize_started` を追加し、`_try_finalize` は SUCCESS の確認の直後（await の前）にこれを確かめて立て、後から入った方はすぐ戻るようにした。`test_concurrent_finalize_runs_once`（2 つ同時に呼んで outputfile の取得と警告が 1 回）を追加し、フラグを外すと失敗することを確認した。なお、確定した側が相手を取り消したときにスレッドで読み進めた分が転送されない点は、修正前も確定処理の読み残しの後に書かれた分は転送されなかったため、挙動は変わらない。

### 5. 判定の重複（🔵 提案）→ 一部対応

指摘 3 の対応で、userId の確認はサービス（`_save()` と同期）に集まった。`name` の確認はルーターに残し、差し替えの判定（アップロードがあり空でない）もルーターで繰り返している。サービスの `create_file`・`update_file` の本体は #251 の PR（#258）が書き換えており、ここに手を入れると衝突するため。#251 のマージ後に寄せることはできる。

### 7. 500 の組み立ての重複（🔵 提案）→ 対応済み

`errors.py` に `unexpected_error_response(path)` を作り、`UnhandledErrorMiddleware` と汎用の例外ハンドラーの両方から使うようにした。汎用の例外ハンドラーは、ミドルウェアより外側（認証・サイズ上限のミドルウェア）で起きた例外を扱うため残す。使われなくなったミドルウェアの `logger` は削除した。

### 8. 同期の userId 確認のタイミング（🟡 注意）→ 対応済み（README を修正）

同期は、新しく登録するファイルがあるかどうかが Waha! の結果で決まるため、移植元と同じく Waha! の処理の後に確かめるのが正しい。指摘 3 の対応で登録・追加学習も同じ考え方になったため、README の記載を「`name` は Waha! を呼ぶ前に返す。`userId` は新しくファイルを作るときだけ（Waha! の処理の後に）確かめる」に直した。

### 9. ポーリングごとのスレッド切り替え（🔵 提案）→ 対応しない

1 回の読み取りは新しく追記された分だけで短く、ストリームの本数も顧客環境のローカルサーバーでは多くない。Issue の項目 10 の目的（ファイルの読み取りでイベントループを止めない）は満たしている。`exists`/`stat` は SUCCESS 後に一度だけ空ファイルを警告するための判定で、毎回は実行されない。

### 10. リビジョン ID（🔵 提案）→ 対応しない

並行して作業している他の PR とリビジョン ID が衝突しないよう、このリポジトリの運用（`issue{番号}` にする）に従った。PR 本文に「他の未マージ PR とマージ順によって down_revision の付け替えが必要」と書いている。
