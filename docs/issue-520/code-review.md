# code-review 結果

`/code-review medium`（`develop` との差分）の結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `studio/service.py` | 形が壊れた本文（`[]`・`{"nodes": 5}`・`{"id": [1]}` など）で、更新・検証が 400 でなく 500 になる | 対応済み |
| 2 | 🔴 致命的 | `studio/service.py` | 更新が原子的でない。ワークフローの組み立てが失敗すると、保存は新しく、登録は消えた状態になる | 対応済み |
| 3 | 🔴 致命的 | `studio/service.py` | 作成が `********` を弾かない。取得の応答をそのまま送ると、伏せた値を API キーとして保存する | 対応済み |
| 4 | 🟡 注意 | `studio/graph_workflow.py` | 検索アダプターが出力を書かなかった失敗が、生成AI ノードの失敗として表示される | 対応済み |
| 5 | 🔵 提案 | `studio/service.py` | `MAX_TOKENS` のような設定値も伏せる。`${A}x${B}` のように参照以外が混ざる値は伏せない | 対応済み |
| 6 | 🔵 提案 | `workflows/registry.py` | `has_dynamic` がテストからしか使われていない（不要コードの削除の規約） | 対応済み |
| 7 | 🔵 提案 | `studio/service.py` | 保存したワークフローが設定ファイルのサービス ID を上書きしても、ログに出ない | 対応済み |

## 詳細

### 1. 形が壊れた本文で 500 になる（🔴 致命的）→ 対応済み

伏せた値を戻す処理（`restore_masked_values`・`_resolve_masked`）が、`parse_graph` による形の検証より前に走り、本文がオブジェクトで `nodes` が配列であることを前提にしていた。

本文がオブジェクトでない、`nodes` が配列でない、`id` が文字列でない場合は、何もせずそのまま返し、後段の `parse_graph` が 400 にするようにした。`id` を辞書の引きに使う箇所は、文字列かどうかを先に確かめる。テスト: `test_service_rejects_malformed_body_with_graph_error`（サービス）、`test_malformed_body_returns_400_not_500`（API）。

### 2. 更新が原子的でない（🔴 致命的）→ 対応済み

`update` は、保存 → 登録解除 → 登録の順で、最後の登録でワークフローを組み立てていたため、組み立てが失敗すると、古い登録だけが消えていた。

失敗しうる処理（`workflow_factory` によるワークフローの組み立てと、保存）を、登録を変える前に済ませる順にした。登録の入れ替え（`_activate`・`_deactivate`）は、失敗しない処理だけにした。作成・起動時の読み込みも同じ順にした。テスト: `test_service_update_is_atomic_when_workflow_build_fails`。

### 3. 作成が `********` を弾かない（🔴 致命的）→ 対応済み

作成では、引き継ぐ保存済みの値がないため、`restore_masked_values(data, {})` を通し、伏せた値のままのプロパティがあれば 400 にした。テスト: `test_service_create_rejects_masked_value`。

### 4. 検索の出力なしの失敗が、生成AI ノードの失敗になる（🟡 注意）→ 対応済み

検索ノードの失敗かどうかの判定に、「検索アダプタの実行に失敗しました」で始まる文言に加えて、「検索アダプタが出力ファイルを書きませんでした」を含めた。テスト: `test_retrieval_output_missing_is_attributed_to_retrieval_node`。

文言で判定する作りは、既存の `GenerativeAiWorkflow` を変えないための割り切り。ノードごとに動かす作りに広げる次の PR で、失敗にノードの情報を持たせる形に直す。

### 5. 秘密情報の判定（🔵 提案）→ 対応済み

名前に `TOKEN` を含むかでなく、名前が `API_KEY`・`PASSWORD`・`SECRET`・`TOKEN` で終わるかで判定するようにした（`MAX_TOKENS` は伏せない）。環境変数の参照は、値全体が `${名前}` 1 つのときだけ伏せない扱いにした。テスト: `test_mask_secrets_by_name_suffix_and_full_reference`。

### 6. `has_dynamic` が不要（🔵 提案）→ 対応済み

`has_dynamic` を削除し、テストは `resolve` の結果で確かめるようにした。代わりに、手順 7 で使う `has_registered`（設定ファイルで登録済みか）を足した。

### 7. 設定ファイルの上書きがログに出ない（🔵 提案）→ 対応済み

保存したワークフローが、設定ファイルで定義済みのサービス ID を登録するとき、警告ログ（`Saved workflow shadows a configured service`）を出すようにした。テスト: `test_service_warns_when_saved_workflow_shadows_config`。
