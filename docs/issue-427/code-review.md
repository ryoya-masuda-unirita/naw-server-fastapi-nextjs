# code-review 結果

`/code-review medium` を、ブランチ `feature/issue-427`（PR #435）に対して実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `server/app/repositories/` の 8 か所 | 降順のとき、一意キーも昇順なので、降順は、昇順の厳密な逆順にならない（同じ値の行は、どちらの向きでも同じ順） | 対応しない（意図どおり） |
| 2 | 🟡 注意（既存） | `message_feedback_repository.py` `find_feedback_messages` | `MessageContent` を外部結合しているため、1 メッセージに複数の `MessageContent` があると、一意キー（フィードバック ID）でも行が一意にならない | 対応しない（未確認として記載） |
| 3 | 🔵 提案（既存） | `library_repository.py` `find_by_message_ids`・`library_tag_repository.py` `find_by_tenant_id_order_by_name` | ページングではない一覧に、一意キーがない | 対応しない（スコープ外） |

## 詳細

### 1. 降順でも一意キーは昇順（対応しない）
移植元（`PageableSortUtil.withIdTieBreaker`、`Sort.by(...).and(Sort.by(ASC, "id"))`）が、向きにかかわらず昇順にしているため、合わせた（`02_基本設計.md` に記載済み）。目的は、ページをめくっても重複・漏れがないこと。同じ値の行は、向きを変えても同じ順で並ぶが、重複・漏れは起きない。

### 2. 外部結合による重複（対応しない）
`message_contents.message_id` に一意制約は見当たらない。ただし、実際に 1 メッセージに複数の `MessageContent` ができるかは確認していない（移植元も同じ結合）。この変更の前から同じ状態で、この変更で悪化させていない。ある場合は、別の Issue で扱う。

### 3. ページングではない一覧（対応しない）
Issue の対象は、ページングする一覧。`find_by_tenant_id_order_by_name` は、名前がテナント内で一意なので、順番は決まっている。`find_by_message_ids` は、ページングではなく、移植元の変更の範囲外。
