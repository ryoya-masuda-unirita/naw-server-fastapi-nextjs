# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント（00〜07）の作成 | `docs/issue-253/00`〜`07` |
| 2 | リクエストサイズの上限と 500 の CORS ヘッダー（項目 1・2・11） | `app/core/middleware.py`、`app/main.py`、`app/core/errors.py`、`app/services/stream/cleanup.py`、`tests/test_app_middleware.py` |
| 3 | 学習ファイル API の入力値を移植元に揃える（項目 3・5・12） | `app/routers/indexes.py`、`app/services/file_service.py`、`tests/test_indexes_request_values.py`、`tests/test_indexes_router.py` |
| 4 | 質問 API・SSE を移植元に揃える（項目 4・6・7・8・9・10） | `app/routers/messages.py`、`app/schemas/message.py`、`app/services/waha_inputs.py`、`app/services/message_content_stream_service.py`、`tests/test_message_request_and_finalize.py`、`tests/test_message_content_sync.py` |
| 5 | DB・起動まわり（項目 13・14・15）と README | `app/models/file.py`、`alembic/versions/issue253_file_parts_file_id_index.py`、`app/core/config.py`、`alembic/env.py`、`docker-entrypoint.sh`、`tests/test_migrations.py`、`tests/test_docker_entrypoint.py`、`README.md` |
| 6 | 動作確認の記録 | `docs/issue-253/08_動作確認.md` |
| 7 | code-review の結果と対応 | `docs/issue-253/code-review.md` ほか |

（パスは `server-local/` 配下）

## 各コミットメッセージ案

```text
#253 issue-253 server-localの移植元との差分対応のドキュメントを作成する
    - 00_チケット内容〜07_gitコミットを作成
```

```text
#253 issue-253 リクエストサイズの上限と500のCORSヘッダーを移植元に揃える
    - multipartのリクエスト全体が215MBを超えたら413にする
    - 想定外のエラーの500をCORSの内側で返す
    - 413のerrorをSpringの理由句にする
    - 定期掃除のループを想定外の例外で止めない
```

```text
#253 issue-253 学習ファイルAPIの入力値の扱いを移植元に揃える
    - status=の空文字を未指定として扱う
    - multipartの空文字を空文字のまま受け取る
    - name・userIdの未指定を400にする
```

```text
#253 issue-253 質問APIとSSEの扱いを移植元に揃える
    - multipart以外は415、textDataの不正なUTF-8は400にする
    - 履歴のtypeを省略可にする
    - 空のdata行を無視し、tailの読み取りをスレッドで行う
    - SSEの確定失敗のテストを追加
```

```text
#253 issue-253 DBのインデックスと起動まわりを直す
    - file_parts.file_idにインデックスを追加する
    - alembicも.envのDATABASE_URLを読む
    - LOG_LEVEL=WARNでもコンテナが起動するようにする
    - READMEを更新
```
