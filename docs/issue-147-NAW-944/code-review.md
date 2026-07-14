# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/routers/auth.py` | `GET /api/auth`が`touch_session`でRedis側TTLは延長するが、ブラウザ側Cookieの`Max-Age`は再送していない | 対応済み |
| 2 | 🟡 注意 | `backend/app/core/session_store.py` | `get_session`が`json.loads`を無例外で実行しており、Redisの値が壊れていると未処理の500になる | 対応済み |
| 3 | 🟡 注意 | `backend/app/core/config.py` | `COOKIE_SAME_SITE=none`かつ`COOKIE_SECURE=false`の組み合わせを防ぐバリデーションがない | 対応済み |
| 4 | 🔵 提案 | `backend/app/core/redis_client.py` | 2関数にdocstringが無い（backend CLAUDE.mdの規約違反） | 対応済み |
| 5 | 🔵 提案 | `backend/app/routers/auth.py` | `create_session`+`set_session_cookie`のブロックが3箇所で重複 | 対応済み |
| 6 | 🔵 提案 | `backend/app/routers/auth.py` | `GET /api/auth`が同じセッションキーに対しRedisへ2回（GET＋EXPIRE）往復している | 対応しない |

## 詳細

### 1. GET /api/authでセッションCookieのMax-Ageが更新されない（🟡 注意）→ 対応済み

`touch_session`はRedis側のTTLを延長するのみで、ブラウザが保持するCookieの`Max-Age`（ログイン時に7200秒で固定）は再送していなかった。これにより、サーバー側のセッションは生きていてもブラウザ側のCookieがログインから2時間で失効し、アクティブに使っていても強制ログアウトされる状態だった。

`get_auth`に`response: Response`を復元し、セッションを延長した際に`set_session_cookie(response, session_id)`を呼んでCookieの`Max-Age`も再送するように修正した。

### 2. Redisの値が壊れている場合に未処理の500になる（🟡 注意）→ 対応済み

`session_store.get_session`が`json.loads`を無例外で実行し、`get_current_user`も`session_data["login_id"]`を無条件で参照していた。Redis上の値が破損・スキーマ不一致の場合、`JSONDecodeError`や`KeyError`が未処理のまま500になっていた。

`get_session`内で`JSONDecodeError`と、`login_id`・`tenant_id`欠如のケースを捕捉して`None`を返すよう修正した。`get_current_user`は既に`None`の場合bearerフォールバックに回る実装だったため、この修正だけで正しいフォールバック動作になる。`tests/unit/test_session_store.py`に異常系テストを追加した。

### 3. same-site=none・secure=falseの組み合わせを防ぐバリデーションがない（🟡 注意）→ 対応済み

`COOKIE_SAME_SITE`と`COOKIE_SECURE`は独立した環境変数で、クロスバリデーションが無かった。`SameSite=None`は`Secure`を伴わないとブラウザ（Chrome/Firefox）がCookieを黙って拒否するため、設定ミスに気づきにくい状態だった。

`Settings`に`model_validator`を追加し、`cookie_same_site == "none"`かつ`cookie_secure`が`False`の場合は起動時に`ValueError`を送出するようにした。`tests/unit/test_config.py`に正常系・異常系のテストを追加した。

### 4. redis_client.pyの2関数にdocstringが無い（🔵 提案）→ 対応済み

backend/.claude/CLAUDE.mdの規約「戻り値がある関数には必ずdocstringを記載する」に反していたため、`get_redis_client_instance`・`get_redis_client`にGoogleスタイルのdocstringを追加した。

### 5. create_session+set_session_cookieのブロックが3箇所で重複（🔵 提案）→ 対応済み

`login`・`login_with_login_key`・`reset_password`で同一の「セッション作成＋Cookie発行」ブロックが重複していたため、`_issue_session`ヘルパーに切り出した。

### 6. GET /api/authがRedisへ2回往復する（🔵 提案）→ 対応しない

`get_current_user`（セッション検証のGET）と`touch_session`（TTL延長のEXPIRE）で2回のRedis往復が発生する。`GETEX`相当の1回の呼び出しにまとめる余地はあるが、ローカルRedisへの往復コストは無視できるレベルであり、`get_session`にTTL延長の責務を混在させると呼び出し元によって延長要否が変わる（ログイン系エンドポイントでは延長不要）ため、条件分岐が増えて複雑になる。現時点では可読性を優先し、対応を見送る。
