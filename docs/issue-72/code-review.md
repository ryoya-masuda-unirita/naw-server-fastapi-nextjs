# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/user_import_service.py` | GroupUser処理が行単位try/exceptの外にあり、行内の重複groupIdなどで例外がジョブ全体に伝播。ジョブがFAILEDになった後も直前まで処理済みの行が無条件commitで残ってしまう | 対応済み |
| 2 | 🔴 致命的 | `backend/app/services/user_import_service.py` | 既存ユーザー更新時、CSVに`createLoginKey`列が無い/空でも`login_key`が無条件に`None`で上書きされ、ログインキー認証ができなくなる | 対応済み |
| 3 | 🟡 注意 | `backend/app/services/user_import_service.py` | `find_by_login_id`を行ごとに個別発行しておりN+1（`backend/.claude/CLAUDE.md`が明示的に禁止するパターン） | 対応済み |
| 4 | 🟡 注意 | `backend/app/routers/users.py` | routerが`UserService`と`UserImportService`の2サービスを呼んでおり「router:service 1対1」規約に違反 | 対応済み |
| 5 | 🟡 注意 | `backend/app/services/user_import_service.py` | `GroupUserRepository.add()`を使わず同じロジックをインラインで再実装 | 対応済み |
| 6 | 🟡 注意 | `backend/app/services/user_import_service.py` | `PasswordHistoryRepository.save()`を使わず直接構築し、`expired_at`が設定されない | 対応済み |
| 7 | 🔵 提案 | `backend/app/services/user_import_service.py` | 全メソッドにGoogleスタイルdocstringが無い | 対応済み |
| 8 | 🔵 提案 | `backend/tests/integration/test_user_import.py` | テストメソッドに日本語docstringが無い | 対応済み |

## 詳細

### 1. GroupUser処理が行単位try/exceptの外（🔴 致命的）→ 対応済み

`_process_row`のGroupUser削除・追加処理（旧実装ではユーザー登録処理のtry/exceptの外）で例外が発生すると、`_process_rows`のループを抜けて`import_users`の外側except（`job.status = FAILED`）に捕捉されるが、その後の`session.commit()`は無条件に実行されるため、既に処理済みだった行がジョブFAILEDにもかかわらずDBにコミットされてしまう問題があった。

修正として、ユーザー登録からGroupUserの削除・追加までを`session.begin_nested()`（SAVEPOINT）で1行分まとめて囲み、行内で例外が発生した場合はそのSAVEPOINTのみロールバックして他の行やジョブレコードの状態を巻き込まないようにした。これにより、行単位のエラーは`errors`に記録されつつ他行の処理は継続され、ジョブ全体もCOMPLETEDのまま進める設計（`03_詳細設計.md`記載の想定挙動）が正しく実現される。

回帰テスト`test_import_users_records_row_error_for_duplicate_group_id_and_continues`を追加し、行内でgroupIdが重複するケースでも他行の処理が継続されることを確認した。

### 2. login_keyの無条件上書き（🔴 致命的）→ 対応済み

`createLoginKey`列の値を`_value(row, "createLoginKey").lower() == "true"`かどうかだけで判定し、既存ユーザー更新時にも`user.login_key = login_key`と無条件代入していたため、CSVに`createLoginKey`列が無い、または空欄の場合に既存ユーザーの`login_key`が`None`で上書きされていた。

修正として、`create_login_key`が明示的に`"true"`の場合のみ新しいログインキーを発行、明示的に`"false"`の場合のみ`None`にクリアし、値が空（列が無い/空欄）の場合は既存の`login_key`を変更しないようにした。

回帰テスト`test_import_users_preserves_login_key_when_column_omitted`を追加した。

### 3. N+1（`find_by_login_id`の行ごと発行）（🟡 注意）→ 対応済み

`backend/.claude/CLAUDE.md`の「N+1問題を発生させない」節に明示的に反するパターンだったため対応した。`UserRepository`に`find_by_login_ids`（IN句で一括取得）を追加し、`_process_rows`でグループと同様に事前に全ユーザーをまとめて取得してから各行の処理に渡すよう変更した。

### 4. router:service 1対1規約違反（🟡 注意）→ 対応済み

`backend/.claude/CLAUDE.md`の「router と service は 1 対 1 で対応させること」に反し、`routers/users.py`が`UserService`と`UserImportService`の両方を呼んでいた。他ドメイン（例: `tenant_endpoints.py`）と同様に、同一サービスに対応する複数routerを別ファイルに切り出す構成を踏襲し、ユーザー一括インポート用のエンドポイントを新規`backend/app/routers/user_imports.py`（`UserImportService`のみに対応）へ分離した。`app/main.py`に新規routerを登録し、`routers/users.py`は`UserService`のみを呼ぶ状態に戻した。

### 5. GroupUserRepository.add()の再実装（🟡 注意）→ 対応済み

既存の`GroupUserRepository.add()`を呼び出すよう変更し、インラインでの`GroupUser(...)`構築・`session.add()`を廃止した。

### 6. PasswordHistoryRepository.save()の再実装（🟡 注意）→ 対応済み

`PasswordHistoryRepository.save()`を呼び出すよう変更し、`UserService`の初期パスワード発行と同様にテナントの`pw_validity_period_days`から`expired_at`を計算して渡すようにした（インポートで作成したユーザーだけパスワード有効期限が設定されない不整合を解消）。

### 7. サービスのdocstring不足（🔵 提案）→ 対応済み

`backend/.claude/CLAUDE.md`のGoogleスタイルdocstring規約に従い、`user_import_service.py`の全メソッドにdocstringを追加した。

### 8. テストの日本語docstring不足（🔵 提案）→ 対応済み

`backend/.claude/CLAUDE.md`のテスト命名規則に従い、`test_user_import.py`の全テストメソッドに意図を示す日本語docstringを追加した。
