# code-review 結果

対象: PR #206（`/code-review 206` を実行）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/user_service.py` | 利用クレジット順では同値時の副次キーが方向に関係なく表示名昇順のため、昇順・降順が完全には反転せず、要件の記述と食い違う | 対応済み（要件の記述を修正） |
| 2 | 🔵 提案 | `backend/tests/integration/test_users.py` | 権限順の結合テストは SQLite では文字列キャストがなくても通るので、修正の退行を検知できない。ステータスコードも確認していない | 一部対応済み |
| 3 | 🟡 注意 | `backend/app/repositories/group_user_repository.py` ほか | 他の一覧 API にも同じソート処理（方向の大文字小文字、タイブレーク無し）が残っている。共通ヘルパー化すべき | 対応しない |
| 4 | 🔵 提案 | `backend/app/services/user_service.py` | ソートキー側は空白除去・小文字化しておらず、表記ゆれがあると作成日時順に黙ってフォールバックする | 対応しない |
| 5 | 🔵 提案 | `backend/app/services/user_service.py` | `desc` 以外の方向指定はすべて昇順として扱い、エラーにならない | 対応しない |
| 6 | 🟡 注意 | `backend/app/services/user_service.py` | `role=foo` のような未知の権限フィルターで `UserRole(role)` が ValueError になり 500 になる | 対応しない |
| 7 | 🔵 提案 | `backend/app/services/user_service.py` | `_resolve_sort_column` の docstring が「モデル属性に解決する」のままで、`role` がキャスト式を返す実態と合わない | 対応済み |
| 8 | 🔵 提案 | `backend/tests/unit/test_user_service.py` | 追加した third-party import が標準ライブラリ import より前にあり PEP 8 の並びに反する | 対応済み |

## 詳細

### 1. 利用クレジット順の昇降が完全には反転しない（🟡 注意）→ 対応済み（要件の記述を修正）

移植元の `UserBillingUsageService.orderByTotalCreditsForUser` は、クレジット合計の後に方向に関係なく `name asc` を副次キーにしている。この挙動は移植元の API 仕様なのでコードは変えず、`01_要件定義.md` に「利用クレジット順は同値時に表示名昇順で並べる（例外）」と明記した。

### 2. 権限順の結合テストが SQLite では退行を検知できない（🔵 提案）→ 一部対応済み

テスト DB（SQLite）は enum を文字列で保持するため、結合テストでは文字列キャストの有無を区別できない。キャストは単体テスト `test_role_sort_column_is_cast_to_string_on_postgresql` で PostgreSQL 方言の SQL を確認して守っている（共通ルールにより実 DB は使わない）。結合テストにはステータスコード 200 の確認を追加した。

### 3. 他の一覧 API にも同じ問題が残る（🟡 注意）→ 対応しない

本 Issue のスコープはユーザー一覧 API。チーム所属ユーザー一覧は #181、テンプレート一覧は #170 で個別に対応する。Issue ごとに develop から別ブランチを切る運用のため、ここで共通ヘルパーを作ると他 Issue のブランチに入らない。横断的な共通化は、各 Issue のマージ後に別途検討する。

### 4. ソートキーの表記ゆれ（🔵 提案）→ 対応しない

フロントエンドは固定値（`updatedAt` / `name` / `role` / `totalCredits`）しか送らない。移植元（Spring Data）もプロパティ名を正規化しないため、移植元の仕様からは外れていない。

### 5. 未知の方向指定（🔵 提案）→ 対応しない

フロントエンドは `asc` / `desc` しか送らない。400 を返すように変えると既存の挙動（フォールバックしてエラーにしない方針）とも食い違うので、今回は変えない。

### 6. 未知の権限フィルターで 500 になる（🟡 注意）→ 対応しない

今回の変更前からある問題で、並べ替えとは関係しない。本 Issue のスコープ外とし、PR でも触れておく。

### 7. docstring の記述（🔵 提案）→ 対応済み

`_resolve_sort_column` の docstring を「ORDER BY 用の列式に解決する」に変え、戻り値の説明に `role` が文字列キャスト式を返すことを書き加えた。

### 8. import の並び（🔵 提案）→ 対応済み

標準ライブラリ（`uuid`）を先にし、空行を挟んで third-party（`fastapi` / `sqlalchemy`）を並べた。
