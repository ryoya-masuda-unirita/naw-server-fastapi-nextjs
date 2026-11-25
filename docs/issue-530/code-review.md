# code-review 結果（PR 1）

`/code-review medium`（`develop` との差分）の結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `ui/src/editor/useEditor.ts` | 版 2 を開こうとして失敗すると、前に開いていたワークフローが画面に残り、取り違えて編集・削除しうる | 対応済み |
| 2 | 🔵 提案 | `studio/flow.py` | `incoming` の辞書が、作るだけで読まれていない（不要コード） | 対応済み |
| 3 | 🔵 提案 | `studio/engine.py` | 実行回数の上限の判定に、到達できない | 対応済み |
| 4 | 🔵 提案 | `studio/engine.py` | 終了が `{{x.text}}` 1 つだけのとき、返る形が、参照するノードの出力モードで変わる | 対応済み（仕様として明記・テスト） |
| 5 | 🔵 提案 | `studio/flow.py` | `version` が `2.0` でも通る | 対応済み |
| 6 | 🔵 提案 | `studio/flow.py`・`main.py` | 入れ子の関数 2 つの docstring が 1 行だけ（規約は NumPy 形式） | 対応済み |
| 7 | 🔵 提案 | `main.py` | 型の絞り込みに `assert` を使っており、`python -O` で消える | 対応済み |

## 詳細

### 1. 取り違えの恐れ（🟡 注意）→ 対応済み

`open` が、版 2 のとき、状態を変えずに戻っていたため、前の版 1 が描かれたままで、保存・削除が押せた。版 2 のとき、`close()` で状態を空にしてから、理由を出すようにした。テスト: `App.test.tsx`「版 1 を開いたあとに版 2 を選ぶと、前に開いていたものを画面から外す」。

### 2・3. 不要コード（🔵 提案）→ 対応済み

`incoming` を削除した。実行回数の上限（`for _ in range(MAX_NODES)`）は、検証（輪がない・出る線は 1 本・ノード数の上限）で、到達できないため、`while` に変えて削除した。終了ノードに着かずに線が尽きた場合だけ、失敗にする（検証済みの定義では起きない）。

### 4. 返る形が出力モードで変わる（🔵 提案）→ 対応済み

版 1 の出力モード 2（本文だけを返す）と同じ動きで、意図的。ただし、server-local が読むのは回答の JSON なので、最後の生成AI は、出力モード 0 にする必要がある。README・`_finish` の docstring に明記し、テスト（`test_run_returns_plain_text_when_end_references_plain_answer_node`）で、仕様として固定した。

### 5. `version: 2.0`（🔵 提案）→ 対応済み

`type(version) is not int` で、`2.0` と `True` を弾く（`bool` は `int` の仲間のため、型で確かめる）。テスト: `test_parse_flow_rejects_invalid_definition` に `version=2.0` を追加。

### 6・7. docstring・`assert`（🔵 提案）→ 対応済み

入れ子の `visit` と `workflow_factory` に、NumPy 形式の docstring を付けた。`assert` を、`TypeError` を投げる確認に変えた。


---

# code-review 結果（PR 2）

`/code-review medium`（`develop` との差分）の結果。

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `studio/flow.py` | `sourceHandle` が配列・オブジェクトのとき、集合の検索で `TypeError` になり、400 でなく 500 になる | 対応済み |
| 2 | 🔴 致命的 | `studio/flow.py` | 条件分岐の `operator` が配列・オブジェクトのとき、同じく `TypeError` | 対応済み |
| 3 | 🔵 提案 | `studio/engine.py` | `contains` だけ、前後の空白を無視しない。`value` に `{{...}}` を書いても展開されない | 対応済み（空白を無視。`value` は、そのままの文字列と明記） |
| 4 | 🔵 提案 | `workflows/generative_ai.py` | 検索の出力に `contexts` がないと、ログ出力の中で素の `KeyError` になり、ノード名が付かない | 対応済み |

## 詳細

### 1・2. 配列・オブジェクトでの `TypeError`（🔴 致命的）→ 対応済み

`handle not in BRANCH_HANDLES`・`operator not in OPERATORS` は、frozenset の検索で、値がハッシュできないと `TypeError` になる。先に `isinstance(..., str)` で型を確かめてから、集合の検索をするようにした。テスト: `test_parse_flow_rejects_invalid_rag_workflow` に、`sourceHandle=[]`・`{"x": 1}`・`operator=["contains"]` を追加。

### 3. `contains` の空白（🔵 提案）→ 対応済み

`contains` も、`value` の前後の空白を無視するようにした（`equals` と揃える）。`value` が、`{{...}}` を展開しないことを、README と `_evaluate` の docstring に書いた。テスト: `("contains", "OK", "OK ", True)`。

### 4. 検索の出力が読めないとき（🔵 提案）→ 対応済み

出力の件数を数える処理を `try` に入れ、読めないときは、`WorkflowError`（`検索アダプタの出力（RAG Context JSON）を読めません`）にした。エンジンが、検索ノードの名前を付ける。テスト: `test_run_retrieval_with_unreadable_output_names_retrieval_node`。
