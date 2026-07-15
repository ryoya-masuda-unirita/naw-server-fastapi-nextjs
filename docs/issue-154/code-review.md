# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/routers/groups.py` | frontend-angular が `GET /api/admin/groups?size=1000` を送るにもかかわらず、`groups.py` の `list_groups` が `le=100` のまま残っており、同じ422が解消されない（修正漏れ） | 対応済み |
| 2 | 🔵 提案 | `backend/app/routers/*.py` | `le=1000` が6箇所にハードコードされており、上限を変える際に複数箇所の修正が必要になる | 対応しない |
| 3 | 🔵 提案 | `backend/app/routers/{rooms,files,libraries,library_tags,groups}.py` | 同種の `le=100` が他のエンドポイントにも残存している | 対応しない |

## 詳細

### 1. groups API の修正漏れ（🔴 致命的）→ 対応済み

当初の要件では、実際に422が観測された4API（users / assistants / prompt-templates / indexes）
のみを対象としていた。しかし frontend-angular のコードを精査したところ、
`template-list/services/groups-api.service.ts:20` が `GET /api/admin/groups` に対して
`params: { size: 1000 }` を送っていることが判明した。

`groups.py` の `list_groups`（`admin_group_router`、`prefix="/api/admin/groups"`）は
`le=100` のままだったため、このままでは**テンプレート一覧画面のグループ選択コンボボックスで
同じ422が発生し続ける**状態だった（調査時のログに出ていなかったのは、当該画面を開いて
いなかったため）。

`groups.py:48` の `size` を `le=1000` に変更し、`01_要件定義.md`・`03_詳細設計.md`・
`06_タスクリスト.md` の対象APIにも `groups` を追加して整合させた。実機で
`GET /api/admin/groups?size=1000` が 200、`size=1001` が 422 になることを確認済み。

### 2. `le=1000` のハードコード（🔵 提案）→ 対応しない

`le=1000` が6箇所に散在しており、共通定数（例: `MAX_PAGE_SIZE`）に切り出す余地がある。

ただし、既存コードも `le=100`・`ge=1`・`Query(20, ...)` といったページネーション関連の値を
各ルーターに直接記述する方針で統一されており、今回の変更分だけを定数化すると、かえって
記述スタイルが不揃いになる。ページネーション関連の値をまとめて定数化するのは本Issueの
スコープ（422の解消）を超えるため、今回は既存パターンの踏襲を優先し対応しない。

### 3. 他エンドポイントに残る `le=100`（🔵 提案）→ 対応しない

`rooms.py`(2箇所)・`files.py`(1箇所)・`libraries.py`(1箇所)・`library_tags.py`(1箇所)・
`groups.py` の `list_all_groups`/`get_group_users` 等には `le=100` が残っている。

これらは frontend-angular が `size=1000` を送っている実証がなく（コード調査で送信先を
すべて洗い出した結果、`size=1000` の送信先は users / assistants / prompt-templates /
indexes / groups の5つのみ）、現時点で422を引き起こしていない。スコープを守るため今回は
変更せず、`01_要件定義.md` のスコープ外に明記した。将来 frontend が全件取得を要求する
ようになった場合は、同様の対応が必要になる。
