# code-review 結果

PR #276 に対して `/code-review` を実行した結果（指摘 10 件）。重大度はこちらで付けた。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `waha-emulator/docker-compose.yml` | README の手順どおりエミュレーターを先に起動すると、Linux では bind mount 元のディレクトリを Docker が root 所有で作り、uid 1000 の server-local が書き込めずチャットが動かない | 対応済み |
| 2 | 🟡 注意 | `waha-emulator/waha_emulator/sessions.py` | セッションに期限がなく、endsession が呼ばれないとメモリに残り続ける（server-local の同期は失敗時に endsession を呼ばない） | 対応済み |
| 3 | 🟡 注意 | `waha-emulator/waha_emulator/jobs.py` | 中断したジョブがストリームに `error` を書かない。タスクが動く前に止めると RUNNING のまま残る | 対応済み |
| 4 | 🟡 注意 | `waha-emulator/waha_emulator/stream_file.py` | `STREAM_ALLOWED_DIR` 未設定だと任意の既存ファイルに追記できる。設定時も確認後のシンボリックリンク差し替えを辿る | 一部対応 |
| 5 | 🔵 提案 | `waha-emulator/waha_emulator/jobs.py` | `StreamFileError`（想定内）が想定外の失敗としてスタックトレース・型名付きで記録される | 対応済み |
| 6 | 🟡 注意 | `waha-emulator/waha_emulator/jobs.py` | outputfile 保存後に `completed` を書けないとジョブ全体が失敗になる。`close()` の例外がタスクから漏れる | 対応済み |
| 7 | 🟡 注意 | `waha-emulator/waha_emulator/routers/servicerun.py` | サービス ID が空（server-local は未指定を空文字列で送る）の `/execute/` が FastAPI 既定の JSON 404 になる | 対応済み |
| 8 | 🔵 提案 | `waha-emulator/waha_emulator/main.py` | 不正な `LOG_LEVEL` で起動時に分かりにくい ValueError になる | 対応済み |
| 9 | 🔵 提案 | `waha-emulator/waha_emulator/errors.py` ほか | 到達しないコード（例外ハンドラーの `isinstance`、`job.task is None`） | 対応済み |
| 10 | 🔵 提案 | `waha-emulator/waha_emulator/llm/azure_openai.py` | 呼び出しごとに `AsyncAzureOpenAI` を作るため、毎回 TLS 接続を張り直す | 対応しない |

## 詳細

### 1. bind mount 元が root 所有で作られる（🔴 致命的）→ 対応済み

Docker は bind mount 元がないと root 所有で作るため、指摘のとおり Linux では server-local（uid 1000）が `data/` に書けなくなる。

- compose のマウントを long syntax にし、`bind.create_host_path: false` を指定した。ディレクトリがなければ作らずに起動エラー（`bind source path does not exist`）にする。手元の Docker で、ないときにエラーで止まりディレクトリが作られないこと、あるときに server-local との往復が通ることを確認した（08 に記録）
- README（ルート・`waha-emulator/`）の手順を、最初に `mkdir -p server-local/data/stream-output` する順に直した

### 2. セッションが残り続ける（🟡 注意）→ 対応済み

server-local の `file_service.py` の同期処理は `execute_sync` → `get_results` が失敗すると `end_session` に到達しない（`finally` ではない）。エミュレーターは同期を常に失敗させるため、確かにセッションが残る。

- `SessionStore` に `SESSION_IDLE_TIMEOUT_SECONDS`（既定 3600 秒。server-local の SSE のタイムアウト 10 分より十分長い）を入れ、`startsession` のたびに、使われていない（実行中のジョブがない）セッションを破棄する。`get()` で最終利用時刻を更新する
- テスト: `test_idle_sessions_are_discarded_on_create`・`test_access_keeps_session_alive`・`test_session_with_running_job_is_kept`

### 3. 中断したジョブの扱い（🟡 注意）→ 対応済み

- `Job.cancel()` を作り、タスクを止めたうえで、まだ RUNNING なら「ジョブが中断されました」で失敗にする（タスクが一度も動く前に止めた場合も RUNNING のまま残らない）。endsession・アプリ終了はこれを使う
- 中断時もストリームに `{"type":"error","message":"ジョブが中断されました"}` を書く（書けなくても続ける）
- テスト: `test_job_cancelled_before_start_is_failure`、`test_end_session_cancels_running_job`（ストリームの `error` を確認）

### 4. ストリームファイルの書き込み先（🟡 注意）→ 一部対応

- 対応: `STREAM_ALLOWED_DIR` 設定時は、確かめた解決後のパスを `O_NOFOLLOW` 付きで開く（最後の要素がシンボリックリンクに差し替えられても辿らない）。README の「ホストで動かす」の起動例に `STREAM_ALLOWED_DIR` を入れ、未設定時のリスクを環境変数の表に書いた
- 対応しない: 未設定時の既定を「制限あり」にはしない。追記するにはセッション（authkey）が必要で、本物の Waha! も渡されたパスに書く。ホストで server-local と組み合わせるときに設定の手間を増やさないため、既定は未設定のままにし、Docker イメージでは設定済みにしている

### 5. StreamFileError の扱い（🔵 提案）→ 対応済み

`jobs.py` で `WorkflowError` と同じく想定内の失敗として扱い、理由だけを result に出す（スタックトレース・型名なし）。テスト: `test_missing_stream_file_fails_job_without_creating_it`（理由の文字列を完全一致で確認）。

### 6. completed の書き込み失敗・close の例外（🟡 注意）→ 対応済み

`completed` は途中経過の区切りにすぎず、回答は outputfile で返せるため、書けなくても警告ログだけにして成功にした。`close()` の `OSError` も警告ログにした。テスト: `test_completed_write_failure_keeps_success`。

### 7. 空のサービス ID（🟡 注意）→ 対応済み

`/execute/` のルートを足し、`/execute/{service_id}` と同じ処理（サービス ID は空）に入るようにした。テスト: `test_execute_with_empty_service_id_uses_default_workflow`、server-local の `WahaClient.execute(session, "")` から呼ぶ `test_waha_client_execute_with_empty_service_id`。

### 8. LOG_LEVEL の検証（🔵 提案）→ 対応済み

`Settings` の検証で大文字にそろえ、`logging` にない名前は「LOG_LEVEL が不正です」で起動時にエラーにした。テスト: `test_log_level_is_validated_and_normalized`。

### 9. 到達しないコード（🔵 提案）→ 対応済み

- 例外ハンドラーは FastAPI の `@app.exception_handler(EmulatorError)` で登録し、引数を `EmulatorError` で受けて `isinstance` をなくした（Starlette の `add_exception_handler` は型が `Exception` 固定のため、mypy を通すために必要だった）
- `Job.task` を `field(init=False)` の非 Optional にし、`job.task is None` の判定をなくした

### 10. Azure OpenAI のクライアントを都度作る（🔵 提案）→ 対応しない

backend の `AzureLlmChatClient` と同じ作り（リクエストごとに `async with` で作って閉じる）に揃えている。土台の確認用サービスで、チャット 1 回あたりの接続確立の負担は LLM の応答時間に比べて小さい。アダプタを移植する後続の Issue で、クライアントの持ち方を移植元に合わせて見直す。
