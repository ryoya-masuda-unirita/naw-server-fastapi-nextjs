# code-review 結果

`/code-review`（medium effort）を実行し、8角度の指摘候補を検証したうえで、確度の高い3件を採用した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/share_service.py` | `upsert`が2回に分けてtransactionをcommitしており、共有リンク作成と共有先グループの置き換えがアトミックでなかった | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/share_service.py`、`backend/app/services/message_service.py` | ルーム所有権チェック（`_require_owned_room`）がmessage_service.pyとshare_service.pyにほぼ同一実装で重複していた | 対応済み |
| 3 | 🔵 提案 | `backend/app/services/share_service.py`、`backend/app/repositories/share_room_repository.py` | `resolve_access`がアクセス可否判定と共有先グループ一覧取得で`share_rooms`テーブルに2回クエリを発行していた | 対応済み |

## 詳細

### 1. upsertの非アトミックなcommit（🟡 注意）→ 対応済み

`ShareRepository.save()`がadd+commit+refreshを内部で行い、その後`share_service.py`側でも`replace_groups_for_share`実行後にもう一度`session.commit()`していた。`replace_groups_for_share`実行中に例外が発生すると、共有リンク（`shares`行）だけが既にcommit済みで、共有先グループ（`share_rooms`行）が作られないまま残る状態になり得た。

`ShareRepository.save()`をadd+flushのみに変更し（IDの確定のみ行い、commitはしない）、共有リンクの保存と共有先グループの置き換えを`upsert`末尾の1回の`session.commit()`にまとめた。

### 2. ルーム所有権チェックの重複（🟡 注意）→ 対応済み

`message_service.py`（#48で追加）と`share_service.py`にほぼ同一の`_require_owned_room`が存在していた。このリポジトリは`service`が別の`service`を呼ぶ構造を禁止しているため、`app/core/room_access.py`に`require_owned_room`関数を新設し、両方の`service`から共通で利用するように変更した。

### 3. resolve_accessの冗長なクエリ（🔵 提案）→ 対応済み

`exists_shared_access`（アクセス可否判定）と`find_group_ids_by_share_id`（共有先グループ一覧取得）が、同じ`share_rooms`テーブルに対して別々にクエリを発行していた。`find_group_ids_by_share_id`を1回呼び出した結果を使い、Python側で集合の積（`set(user_group_ids) & set(team_ids)`）を取ることでアクセス可否を判定するよう変更し、`exists_shared_access`メソッド自体を削除した。

## 再確認

- `pytest`（307件）・`ruff check`が対応後も全て通過することを確認
- ローカルPostgreSQLで、共有リンクの作成・再作成（グループ入れ替え）・所有者/共有先グループメンバー/無関係ユーザーによるアクセス解決を`curl`で再確認し、修正前と同じ結果になることを確認
