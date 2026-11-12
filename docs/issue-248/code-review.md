# code-review 結果

対象: PR #260（`/code-review 260` を実行）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/auth_service.py` | ロック判定と失敗記録が別の処理のため、並行リクエストで上限を超えて試せる | 対応しない |
| 2 | 🟡 注意 | `backend/app/services/auth_service.py` | 429 と応答時間の差から、ログインIDが実在するか分かる | 対応しない |
| 3 | 🔵 提案 | `backend/app/services/auth_service.py` | ログインIDを知っていれば、他人の再設定をロックし続けられる | 対応しない |
| 4 | 🟡 注意 | `backend/app/core/config.py` | 回数・ロック時間に下限がなく、0 以下だとロックが壊れる | 対応済み |
| 5 | 🟡 注意 | `backend/app/services/auth_service.py` | コミット後に失敗記録を消すため、Redis 障害時にパスワードは変わったのに 500 になる | 対応済み |
| 6 | 🟡 注意 | `backend/app/core/password_mismatch_store.py` | eviction 設定によっては Redis のキーが追い出され、ロックが外れる | 対応しない |
| 7 | 🔵 提案 | `backend/app/core/password_mismatch_store.py` | 記録後の判定で Redis との往復が 1 回増える | 対応済み |
| 8 | 🔵 提案 | `backend/tests/unit/conftest.py` | `fake_redis` fixture が `test_session_store.py` のローカル定義と重複している | 対応済み |
| 9 | 🔵 提案 | `backend/app/core/password_mismatch_store.py` | `_key` に docstring がない | 対応済み |
| 10 | 🔵 提案 | `backend/tests/integration/test_auth.py` | テストが上限回数 5 を直書きしており、`.env` で変えると落ちる | 対応済み |

🔴 致命的の指摘はなし。

## 詳細

### 1. 並行リクエストでの上限すり抜け（🟡 注意）→ 対応しない

移植元 `PasswordResetService` も同じ順序で処理している（`isLockedOut` で判定 → 照合 → `recordFailureAndCheckLockout`）。並行性への対策は移植元にない独自の挙動になる。照合の前に試行を予約する方式にすると、ポリシー違反（400）やパスワード履歴なしのときに予約を取り消す処理も必要になり複雑になるため、本 Issue（移植元どおりにする）の範囲では対応しない。bcrypt の照合コストで並行数は実質的に絞られる。

### 2. 429 と応答時間からログインIDの存在が分かる（🟡 注意）→ 対応しない

Issue へのコメントで「失敗回数ロックの数え方（存在しないユーザーの失敗も数えるか）も移植元どおりに」と指示されている。移植元はユーザーIDがないと失敗を記録できず、存在しないユーザーはロックされない。応答時間の差も移植元に同じくある。メッセージとステータスの共通化（今回の対応）までを本 Issue の範囲とする。

### 3. 他人の再設定をロックし続けられる（🔵 提案）→ 対応しない

アカウント単位でロックする以上、避けられない性質であり、移植元も同じ設計。IP 単位の制限などは移植元にない機能のため、本 Issue では入れない。

### 4. 設定値に下限がない（🟡 注意）→ 対応済み

`PasswordResetSettings` の `max_failure_attempts` / `lockout_minutes` に `ge=1` を付けた。0 以下なら起動時（設定の読み込み時）に検証エラーになる。`test_config.py` に 0・-1 を拒否するテストを追加した。

### 5. コミット後に Redis 障害が起きると不整合になる（🟡 注意）→ 対応済み

失敗記録の削除をコミットの前に移した。移植元は再設定と同じトランザクションの最後で削除するため、削除に失敗すれば再設定ごと取り消される。今回の修正で、Redis 障害時はコミット前に例外となり、パスワードは変わらない（移植元と同じ）。逆にコミットが失敗した場合は記録だけ消える。しかしここに来た時点で旧パスワードは正しいので、問題はない。

### 6. Redis の eviction でロックが外れる（🟡 注意）→ 対応しない

DB テーブルを追加するにはマイグレーションが必要になる。そのため Redis に置く判断をした（`02_基本設計.md` に理由を記載）。Redis はログインセッションの保存にも使っている。キーが追い出されれば、セッションも同様に消えて運用上の問題になるので、本番相当の環境では eviction させない設定（`noeviction`）が前提となる。ログイン失敗ロックを移植する際の保持期間の見直しは、`password_mismatch_store.py` のモジュール docstring と `02_基本設計.md` に書いた。

### 7. Redis との往復が 1 回増える（🔵 提案）→ 対応済み

`record_failure_and_check_lockout` で、記録と同じトランザクション付きパイプラインの中で `ZCOUNT` を実行し、その結果で判定するようにした。判定する件数も、記録した瞬間の値になる。

### 8. `fake_redis` fixture の重複（🔵 提案）→ 対応済み

`tests/unit/conftest.py` に追加した fixture で不要になった、`tests/unit/test_session_store.py` のローカル定義と未使用の import を削除した。`tests/integration/conftest.py` の定義は今回の変更とは関係なく、範囲外のため残した。

### 9. `_key` の docstring（🔵 提案）→ 対応済み

Google スタイルの docstring を付けた。期間の開始時刻の計算を `_window_start` にまとめ、これにも docstring を付けた。

### 10. テストの上限回数の直書き（🔵 提案）→ 対応済み

単体テスト（`test_auth_service.py`）・結合テスト（`test_auth.py`）とも、サービスと同じ `get_password_reset_settings()` から回数・ロック時間を取るようにした。

## 修正後の確認

```text
$ uv run pytest -q
1065 passed in 50.84s
$ uv run mypy app tests
Success: no issues found in 218 source files
$ uv run ruff check .
All checks passed!
$ uv run ruff format --check .
242 files already formatted
```
