# code-review 結果

PR #255 に対して `/code-review` を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/repositories/group_user_repository.py` | `searchText` が空白のみのとき、移植元（`isBlank` なら条件なし）と違い空白で LIKE 検索してしまう | 対応しない |
| 2 | 🔵 提案 | `backend/app/repositories/group_user_repository.py` | `str.strip()` と Java の `isBlank()` で、ノーブレークスペースなどの扱いが違う | 対応しない |
| 3 | 🔵 提案 | `backend/app/repositories/group_user_repository.py` | 未知の role で結果が空と分かっていても件数・一覧の 2 クエリを発行している | 対応済み |
| 4 | 🔵 提案 | `backend/app/repositories/group_user_repository.py` | 定数 2 つと if/elif/else は、ロールから管理者フラグへの対応表 1 つで書ける | 対応済み |
| 5 | 🔵 提案 | `backend/app/services/group_service.py` | 検索文字列の引数名が router（`search_text`）・service（`search`）・repository（`search_text`）で揃っていない | 対応しない |

## 詳細

### 1. `searchText` の空白のみの扱い（🟡 注意）→ 対応しない

指摘どおり移植元と挙動が違う。ただし Issue #237 の対象は `role` の絞り込みで、`searchText` には検索対象（移植元はユーザー名だけ、こちらはログインIDも）の差分もある。検索の差分はまとめて別の Issue で扱うのが妥当なため、ここでは直さない。PR 本文の「未確認事項」に対象外として見つけた差分を書いた。

### 2. `strip()` と `isBlank()` の差（🔵 提案）→ 対応しない

`03_詳細設計.md` の補足に既知の差分として記載済み。差が出るのはノーブレークスペースなどだけで構成された値を `role` に送った場合に限られ、画面からは送られない。Java の `Character.isWhitespace` を再現する処理を足すほどの価値はないと判断した。

### 3・4. 未知の値で DB に問い合わせない・対応表にまとめる（🔵 提案）→ 対応済み

`_IS_ADMIN_BY_GROUP_ROLE: dict[str, bool] = {"ADMIN": True, "USER": False}` に置き換え、`role.upper()` が対応表にない場合は `return [], 0` で返すようにした。移植元は常に偽の条件で問い合わせるが、返る結果（一覧が空・総件数 0）は同じ。使われなくなった `false` の import は削除した。テスト（`TestGroupUsersRoleFilter` 13 件）・全件・mypy・ruff を再実行し、すべて成功した（`08_動作確認.md` の 5）。

なお、`includeUsage=true` のときに service 側で請求期間の解決が先に走る点は、service の処理順の変更になるため変えていない。

### 5. 引数名の不一致（🔵 提案）→ 対応しない

service の `list_group_users` の docstring は、service 自身の引数名 `search` と一致している。引数名の変更は今回の変更と関係がなく、呼び出し箇所にも影響するため、スコープ外とした。
