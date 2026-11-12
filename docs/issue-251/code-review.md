# code-review 結果

PR #258 に対して `/code-review` を実行した結果と対応。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `server-local/app/services/file_service.py` | 論理削除が数分前に読み込んだ ORM オブジェクトを更新するため、Waha! 待ちの間に行が消えると `StaleDataError` で 500 になる | 対応済み |
| 2 | 🟡 注意 | `server-local/app/services/file_service.py` | 同じファイルへの差し替え同士・差し替えと削除が同時に来ると、両方成功して重複や復活が起きる | 対応しない |
| 3 | 🟡 注意 | `server-local/app/services/file_service.py` | 読み取り後、Waha! 待ちの間もセッションが接続プールの接続を持ち続ける | 対応済み |
| 4 | 🟡 注意 | `server-local/tests/test_file_service_db_lock.py` | テストが `busy_timeout=0` を設定した接続をプールに戻している | 対応済み |
| 5 | 🔵 提案 | `server-local/tests/test_file_service_db_lock.py` | 論理削除・追加学習のロックのテストがない | 対応済み |
| 6 | 🔵 提案 | `server-local/app/services/file_service.py` | 再登録を先に行い、旧データの削除を後に回せば、再登録失敗時の Waha! と DB の食い違いを防げる | 対応しない |

## 詳細

### 1. 論理削除の StaleDataError（🔴 致命的）→ 対応済み

`_delete_from_db` の論理削除を、ORM オブジェクトの属性更新から ID 条件の `UPDATE files SET status=DELETED, updated_at=現在時刻 WHERE id=?` に変えた。物理削除と同じく、0 件でもエラーにならない。`test_logical_delete_when_file_deleted_while_waiting` を追加し、指摘前のコードでは失敗（500）、修正後は 204 になることを確認した。

### 2. 同じファイルへの同時操作（🟡 注意）→ 対応しない

移植元（H2）も同じ挙動のため。移植元では、同時に来た 2 本目の差し替え・削除は行ロックで待った後、`deleteById` が 0 件（Spring Data JPA 3 は存在しない ID を無視する）になり、そのまま新しいファイルを保存する。修正前の server-local で 2 本目が失敗していたのは SQLite のファイル単位のロックによるもので、意図した抑止ではない（チャットの保存など無関係な書き込みも同じく失敗していた）。挙動は `03_詳細設計.md` の「同じファイルへの同時操作」に書いた。

### 3. Waha! 待ちの間の接続保持（🟡 注意）→ 対応済み

`_find_file_with_parts` を `_find_part_ids` に変え、パート ID を `list[str]` に取り出した後に `session.rollback()` で読み取りを終えて接続をプールに返し、`session.expunge_all()` でセッションを空にするようにした。後の DB 更新は ID 条件の SQL で行うため、ORM オブジェクトは使わない。

### 4. テストの busy_timeout（🟡 注意）→ 対応済み

`app/core/database.py` の `busy_timeout` の値を定数 `SQLITE_BUSY_TIMEOUT_MS` にし、テストの `ConcurrentWriter.write()` は `finally` でその値に戻すようにした。

### 5. 論理削除・追加学習のテスト（🔵 提案）→ 対応済み

`test_logical_delete_does_not_lock_db`・`test_logical_delete_when_file_deleted_while_waiting`・`test_additional_learning_does_not_lock_db` を追加した。

### 6. 再登録を先にする（🔵 提案）→ 対応しない

Waha! が差し替え前と同じパート ID を返す場合（`test_update_with_same_ids_recreates_parts` のケース）、再登録の後に旧パート ID で削除ジョブを実行すると、登録したばかりのデータを消してしまう。また Waha! の呼び出し順を移植元（削除 → 登録）から変えることになる。再登録失敗時に DB に旧ファイルが残る点は移植元と同じで、同じファイルに対して差し替えをやり直せる。
