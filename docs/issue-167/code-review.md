# code-review 結果

対象: PR #202（`/code-review 202` を実行）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/schemas/auth.py` | `{"loginId": null, "username": "x"}` のように `loginId` が null で `username` が有効な場合も 422 になる | 対応しない |
| 2 | 🟡 注意 | `backend/app/schemas/auth.py` | 両キー指定時、移植元（Jackson）は後に出たキーが勝つが、移植先は常に `loginId` 優先 | 対応しない（設計書に差分を明記） |
| 3 | 🟡 注意 | `backend/app/schemas/auth.py` | 移植元の `@NotBlank` が未移植で、空文字のログインIDが 400 ではなく DB 検索後の 403 になる | 対応しない（スコープ外） |
| 4 | 🔵 提案 | `backend/app/schemas/auth.py` | OpenAPI に `username` を許容することが表示されない（移植元の `@Schema(description=...)` 相当がない） | 対応済み |
| 5 | 🔵 提案 | `backend/tests/integration/test_auth.py` | username キーの 403 テストが status だけを見ており、`User not found` の 403 と区別できない | 対応済み |
| 6 | 🔵 提案 | `backend/tests/integration/test_auth.py` | ログインID未指定の 422 テストが不要な `test_user_with_password` フィクスチャ（DB データ作成）に依存している | 対応済み |
| 7 | 🔵 提案 | `backend/tests/integration/test_auth.py` | username キーの成功テストで、セッション発行とパスワード更新まで確認していない（要件 2 の検証が不十分） | 対応済み |

🔴 致命的: 0 件

## 詳細

### 1. `loginId: null` + 有効な `username` が 422 になる（🟡 注意）→ 対応しない

移植元でも、Jackson はキーが出た順に同じプロパティへ値を入れるため、`username` が先で `loginId: null` が後なら null になり、`@NotBlank` で 400 になる。移植元の挙動も JSON のキー順序に依存しており、「必ず受け付ける」わけではない。frontend-angular は `username` だけを送るのでこのケースは起きない。null を読み飛ばすための `model_validator(mode="before")` を足すほどの価値はないと判断した。

### 2. 両キー指定時の優先順位が移植元と異なる（🟡 注意）→ 対応しない（設計書に差分を明記）

移植元の「後に出たキーが勝つ」は JSON のキー順序に依存する挙動で、仕様として再現する価値は低い。移植先は順序によらず `loginId` 優先とし、`03_詳細設計.md` に意図的な差分として追記した。正規のクライアントはどちらか一方のキーしか送らないため実害はない。

### 3. `@NotBlank` 未移植（🟡 注意）→ 対応しない（スコープ外）

本 Issue はフィールド名不一致による 422 の解消に限定しており、`01_要件定義.md` のスコープ外に明記している。空文字でも 403（認証エラー）になり、パスワードが変更されることはないので、セキュリティ上の問題はない。共通ルールで新規 Issue の起票はしない方針のため、PR 本文の未確認事項にフォローアップ候補として記載した。

### 4. OpenAPI に `username` 許容の記載がない（🔵 提案）→ 対応済み

`Field(..., description="ログインID (username も許容)")` を追加し、移植元の `@Schema(description=...)` と同じ説明を OpenAPI に出すようにした。

### 5. 403 テストで detail を見ていない（🔵 提案）→ 対応済み

`assert response.json()["detail"] == "Invalid old password"` を追加し、`username` がユーザー検索に正しく使われ、旧パスワード照合まで届いたことを確認するようにした。

### 6. 422 テストの不要なフィクスチャ（🔵 提案）→ 対応済み

`test_user_with_password` フィクスチャへの依存をやめ、パスワードはリテラルにした。ルーターまで含めて 422 になることを結合レベルで確認する意味はあるため、テスト自体は残した（単体テストはスキーマだけを見ている）。

### 7. username 成功テストで更新・セッション発行まで見ていない（🔵 提案）→ 対応済み

次の確認を追加した。
- レスポンスにセッション Cookie（`SESSION_COOKIE_NAME`）があること
- 同じ `username` で、新パスワードを旧パスワードとしてもう一度再設定 API を呼ぶと 200 になること（パスワード履歴が実際に更新されたことの確認）

当初は新パスワードで `/auth/login` することで更新を確認しようとした。しかしテスト環境のインメモリ SQLite が timezone なしの datetime を返すため、ログイン処理の有効期限比較（`expired_at < datetime.now(timezone.utc)`）が `TypeError` になり使えなかった。本番の PostgreSQL（timestamptz）では起きない、テスト環境固有の制約である。本 Issue の変更とは無関係なので、ここでは修正していない。

## 再テスト

```
$ uv run pytest tests/unit/test_auth_schemas.py tests/integration/test_auth.py -v -p no:warnings
============================== 28 passed in 7.14s ==============================
$ uv run pytest -q -p no:warnings
786 passed in 38.55s
```
