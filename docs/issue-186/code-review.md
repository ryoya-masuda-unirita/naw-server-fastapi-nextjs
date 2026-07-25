# code-review 結果

`/code-review develop`（develop→feature/issue-186の差分、`backend/app`・`docker-compose`関連が対象、テスト/ドキュメントは除外）を実行した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `app/core/config.py`(`AwsSettings`) | `aws_s3_bucket_name`/`aws_sqs_queue_url`がデフォルトなしの必須フィールドで、`app.main`の`lifespan`が無条件に`AwsSettings()`を生成するため、これらの環境変数が未設定の環境ではapp起動自体が失敗する | 対応済み |
| 2 | 🔴 致命的 | `app/services/user_import_service.py` | アップロード成功後にSQS送信が失敗すると、S3上にアップロード済みファイルが孤立したまま残る（クリーンアップなし） | 対応済み |
| 3 | 🟡 注意 | `app/services/user_import_listener.py` | CSVデコードエラーが握り潰され、行0件のまま`COMPLETED`として成功扱いになる | 対応済み |
| 4 | 🔵 提案 | `app/services/user_import_listener.py` | 二重処理防止チェックが`PROCESSING`状態を除外しておらず、再配信時に再処理される可能性がある | 対応しない |

## 詳細

### 1. AwsSettingsの必須フィールドによるapp起動失敗（🔴 致命的）→ 対応済み

`AwsSettings`は他の設定クラス（`RedisSettings`等）と同様に「必須値がなくてもモジュールのインポート自体は失敗しないように分離する」意図のクラスだったが、`aws_s3_bucket_name`・`aws_sqs_queue_url`にはデフォルト値を与えていなかった。`app.main`の`lifespan`は`AWS_SQS_LISTENER_ENABLED=false`の場合でも`start_listener_task`経由で無条件に`get_aws_settings()`（＝`AwsSettings()`の生成）を呼ぶため、これら2つの環境変数が未設定の環境ではapp起動時に`ValidationError`で失敗してしまっていた。

`aws_s3_bucket_name`・`aws_sqs_queue_url`にデフォルト値`""`を設定し、`AwsSettings()`自体は常に生成できるようにした。代わりに、実際にS3/SQSを使おうとする箇所（`get_user_import_file_storage()`・`UserImportQueueService.send_import_message`・`UserImportListener.run_forever`）でこれらが空文字列の場合に明示的な`RuntimeError`を送出するようにし、設定不備が起きた場合でもapp全体を巻き込まず、該当機能の呼び出し時にわかりやすいエラーとして表面化するようにした。`tests/unit/test_config.py`に`TestAwsSettings`を追加し、未設定でも生成できることを回帰テスト化した。

### 2. SQS送信失敗時にS3ファイルが孤立する（🔴 致命的）→ 対応済み

`UserImportService.import_users`は、S3アップロード成功後にSQS送信を行うが、送信が失敗した場合の例外は関数末尾の`except Exception`でまとめて捕捉され、ジョブを`FAILED`にするのみでアップロード済みファイルの削除は行っていなかった。ネットワーク不調やSQS障害でジョブが失敗するたびに、S3上に誰からも参照されない孤立ファイルが蓄積する問題があった。

`send_import_message`呼び出しを個別の`try/except`で囲み、失敗時は直前にアップロードしたファイルを`storage.delete(storage_url)`で削除してから例外を再送出するよう修正した。あわせて、`job.storage_url`の設定をキュー送信成功後に移動し、削除済みのURLがジョブに記録され続けないようにした。`tests/integration/test_user_import.py`に`test_import_users_deletes_uploaded_file_when_queue_send_fails`を追加した。

### 3. CSVデコードエラーの握り潰し（🟡 注意）→ 対応済み

`UserImportListener.process_import_message`は、`UserImportService._decode_csv`がデコードエラーを`decode_errors`に追記した場合でも、それを無視して空の`rows`リストのまま処理を続行し、結果としてジョブが「0件成功のCOMPLETED」になっていた。アップロード時点で文字コードは検証済みのため通常は発生しないが、ストレージ上のファイルが何らかの理由で破損した場合等に、実際には何も処理されていないのに成功として扱われてしまう。

デコードエラーが存在する場合は、その場でジョブを`FAILED`にしてエラー内容を記録し、処理を打ち切るよう修正した。`tests/integration/test_user_import_listener.py`に`test_process_import_message_fails_job_on_undecodable_content`を追加した。

### 4. 二重処理防止チェックがPROCESSING状態を除外していない（🔵 提案）→ 対応しない

`process_import_message`の二重処理防止チェックは`job.status in (COMPLETED, FAILED)`のみをスキップ対象としており、`PROCESSING`状態のジョブに対するメッセージ再配信はスキップされない。そのため、処理の途中でメッセージが再配信された場合、同じジョブが並行または連続して再処理される可能性がある。

ただし、これは移植元（Spring Boot）の`UserImportListener.java`と同一の挙動であり、意図的な設計判断（アプリがクラッシュして`PROCESSING`のまま止まったジョブを、再配信によって復旧できるようにする）と考えられる。`PROCESSING`もスキップ対象に加えると、クラッシュ後にジョブが永久に進まなくなるリスクの方が大きい。ローカル環境かつ単一リスナーインスタンスという現状のスコープでは実害は小さいため、移植元の挙動を踏襲したまま今回は変更しない。
