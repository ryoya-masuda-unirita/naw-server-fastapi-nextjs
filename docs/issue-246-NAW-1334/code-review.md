# code-review 結果

対象: PR #257（`/code-review 257`）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/core/date_parse.py` | UTC に直すと `datetime` の範囲を外れる日時で `OverflowError` が出て 500 になる | 対応済み |
| 2 | 🟡 注意 | `backend/app/routers/files.py`・`rooms.py` | Router の中で日時の検証を呼んでいる（Router にバリデーションを書かない規約） | 対応済み |
| 3 | 🔵 提案 | `backend/app/core/date_parse.py` | `str.strip()` は Java `String.isBlank` と空白の範囲が違う（U+00A0 など） | 対応しない |
| 4 | 🔵 提案 | `backend/app/core/date_parse.py` | 小数秒は 6 桁に切り捨てられ、Java は 9 桁まで保持する | 対応しない |
| 5 | 🔵 提案 | `backend/app/core/date_parse.py` | 0000 年・うるう秒 `:60` を Java は受け付けるがこちらは 400 | 対応しない |
| 6 | 🔵 提案 | `backend/app/services/tenant_service.py` | 既存の `TenantService._parse_iso_datetime` と ISO 8601 の解釈が 2 種類になる | 対応しない |
| 7 | 🔵 提案 | `backend/app/core/date_parse.py` | 正常な値でも毎回 `HTTPException` を作っている | 対応済み |
| 8 | 🔵 提案 | `backend/tests/unit/test_date_parse.py` | 範囲外の値のテストがなく、#1 を検出できなかった | 対応済み |

## 詳細

### 1. 範囲外の日時で 500 になる（🔴 致命的）→ 対応済み

`9999-12-31T23:59:59-01:00` のように、形は正しくても UTC に直すと 10000 年になる値で `astimezone` が `OverflowError` を投げ、500 になっていた。`ValueError` と合わせて `OverflowError` も捕まえ、移植元と同じメッセージの 400 にした。移植元は `Instant` が 10000 年も表せるため 200 になり得るが、DB の日時型でも扱えない範囲であり、500 を返さないことを優先した。

### 2. Router の中での検証（🟡 注意）→ 対応済み

既存の `sort_query`（`app/core/sort.py`）と同じく、日時のクエリパラメータを解釈する依存関数を作る `iso_instant_query(parameter_name, description)` を `app/core/date_parse.py` に追加し、Router は `Depends(iso_instant_query(...))` で宣言するだけにした。OpenAPI 上のパラメータ名・説明は変わらないことを確認した。

### 3. 空白判定の範囲の違い（🔵 提案）→ 対応しない

U+00A0（ノーブレークスペース）だけを送るのは画面からは起きず、Python 側でも「指定なし」になるだけで誤った絞り込みにはならない。Java の `Character.isWhitespace` と同じ範囲を再現するコードを足すほどの価値はないと判断した。

### 4. 小数秒の桁数（🔵 提案）→ 対応しない

保存先の PostgreSQL の `timestamptz` はマイクロ秒（6 桁）までしか持たず、比較対象の値も 6 桁に収まる。画面はミリ秒（3 桁）で送る。7 桁以上の差が結果に影響するのはマイクロ秒未満の差だけで、実用上の影響はない。

### 5. 0000 年・うるう秒（🔵 提案）→ 対応しない

画面から送られない値であり、こちらでは 400（移植元と同じメッセージ）になるだけで、誤った結果や 500 にはならない。

### 6. テナントの日時解釈との重複（🔵 提案）→ 対応しない

`TenantService._parse_iso_datetime` はテナント API 側の別仕様で、移植元でも `DateParseUtil.parseIsoInstant` を使っていない。この Issue の範囲（移植元で `parseIsoInstant` を使う API）外のため変更しない。

### 7. 例外を毎回作っている（🔵 提案）→ 対応済み

`_invalid_iso_instant(parameter_name)` を追加し、失敗したときだけ例外を作るようにした。

### 8. 範囲外の値のテスト（🔵 提案）→ 対応済み

`test_rejects_invalid_value` に `9999-12-31T23:59:59-01:00` を追加した。
