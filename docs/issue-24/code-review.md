# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/group_service.py` | `remove_group_user`・`update_group_user_role`でユーザーIDのUUIDパース失敗が未捕捉のまま500になる | 対応済み |
| 2 | 🟡 注意 | `backend/app/repositories/group_repository.py`・`group_user_repository.py` | 検索文字列の`%`・`_`がLIKEのワイルドカードとしてエスケープされずに解釈される | 対応済み |
| 3 | 🔵 提案 | `backend/app/services/group_service.py` | グループ取得＋権限チェックの2行パターンが6箇所で重複している | 対応しない |
| 4 | 🔵 提案 | `backend/app/repositories/group_user_repository.py`・`group_repository.py` | `add()`はコミットを呼び出し元に委ね、`remove()`/`delete()`は内部でコミットしており一貫していない | 対応しない |
| 5 | 🔵 提案 | `backend/app/services/group_service.py` | グループ一覧取得時、グループごとに所属ユーザーを個別クエリで取得しておりN+1になる（20件のページで20回以上のクエリ） | 対応しない（設計時に把握済み） |

## 詳細

### 1. UUIDパース失敗時の500エラー（🟡 注意）→ 対応済み

`add_group_users`は不正な形式のユーザーIDに対して`try/except ValueError`で404を返していたが、`remove_group_user`・`update_group_user_role`には同様の保護がなく、`DELETE /api/admin/groups/{id}/users/not-a-uuid`のようなリクエストが未捕捉の`ValueError`により500になっていた。

`GroupService._parse_user_uuid`という共通ヘルパーを追加し、3箇所すべてで同じ変換処理を使うように統一した。不正な形式の場合は404を返す（存在しないユーザーと同じ扱い）。回帰テストとして`test_add_malformed_user_id_returns_404`・`test_remove_malformed_user_id_returns_404`・`test_update_role_malformed_user_id_returns_404`を追加した。

### 2. LIKE検索のワイルドカード未エスケープ（🟡 注意）→ 対応済み

既存の`UserService._escape_like_pattern`と同様のエスケープ処理が、新規追加した`GroupRepository.find_page`・`GroupUserRepository.find_page_by_group`の検索処理には実装されていなかった。グループ名やユーザー名・loginIdに`%`・`_`が含まれる場合、検索結果が意図せず広がる・狭まる不具合があった。

共通処理として`app/core/search.py`に`escape_like_pattern`を切り出し、両リポジトリから利用するように修正した（既存の`UserService._escape_like_pattern`は今回のスコープ外のため変更していない）。回帰テストとして`test_search_with_percent_is_treated_as_literal`を追加した。

### 3. グループ取得＋権限チェックの重複（🔵 提案）→ 対応しない

`_get_group_or_404`と`_assert_can_manage_group`の呼び出しペアが6箇所で重複している。ヘルパー化すれば行数は減らせるが、現状の重複は2行×6箇所と小さく、可読性を大きく損なうものではないため、今回は見送る。

### 4. リポジトリ内コミット境界の不一致（🔵 提案）→ 対応しない

`GroupUserRepository.add`は呼び出し元（`GroupService`）でのコミットを前提とし、`remove`・`GroupRepository.delete`は内部でコミットしている。現状のユースケースでは複数の`add`/`remove`を1トランザクションにまとめる要件がなく実害はないため、今回は見送る。将来複数操作をアトミックに行う必要が出た場合に統一する。

### 5. グループ一覧取得のN+1（🔵 提案）→ 対応しない（設計時に把握済み）

`03_詳細設計.md`の「実装時の確認事項」で事前に識別していたトレードオフ。ページごとに数十件規模のグループ一覧を想定しており、過度な最適化を避けつつ明らかな問題が出た時点で対応する方針とする。
