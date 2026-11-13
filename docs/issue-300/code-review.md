# code-review 結果

`/code-review medium 350` の指摘に対する対応。🔴（致命的）はなし。7 件のうち 6 件を修正し、1 件は設計判断として理由を記録した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `waha-emulator/waha_emulator/workflows/embedding.py` | 学習でアダプタが途中まで登録した後に失敗しても、登録済みの行を消さない（再試行で重複する） | 対応済み |
| 2 | 🟡 注意 | 同上 | `filepath` 列がない既存テーブルだと、アップロード学習の `UPDATE ... SET filepath` が失敗する | 対応済み（更新だけ失敗を許す） |
| 3 | 🟡 注意 | 同上 | アダプタの TSV を正規表現で読み戻しており、パスに `"` やタブがあると行を捨てる | 対応済み |
| 4 | 🟡 注意 | 同上 | 行 ID に当たらない ID をそのままファイル ID として削除に回し、成功扱いになる | 対応済み |
| 5 | 🟡 注意 | `embedding_controller.py` | 先頭の行が分割文字数より長いと、空のチャンクを埋め込み・登録する（移植元と同じ） | 対応済み（移植元から変更） |
| 6 | 🔵 提案 | 同上 | 「import → グラフ書き込み → 前の ID 更新」がループ内と最終チャンクで二重に書かれている | 対応済み |
| 7 | 🔵 提案 | `waha-emulator/waha_emulator/workflow_config.py` | `outputType` に list を書くと `TypeError`（設定エラーにならない） | 対応済み |

## 詳細

### 1. 学習の失敗後に登録済みの行が残る（🟡）→ 対応済み

アダプタは 1 チャンクずつベクトルDB にコミットするため、2 件目の埋め込みが失敗すると 1 件目が残り、server-local の再試行のたびに別のファイル ID で重複していた。`_learn` が、アダプタの失敗時に出力 TSV に残っていたファイル ID を `_remove_partial_rows` で削除する（できなくても元の失敗を返す）。`test_learn_removes_partial_rows_when_adapter_fails_midway` で確認。なお、Graph Candidate の拒否時の補償削除は移植元どおり core が行う（バッファされた TSV には残らない経路のため、この片付けの対象外）。

### 2. `filepath` 列がないテーブル（🟡）→ 対応済み

`filepath` はアップロードの見た目のパスを直すためだけの更新（`_relabel_source_path`）で、失敗しても登録済みの行を失敗扱いにすべきでない。更新の失敗は警告ログにして学習は成功のままにした。PostgreSQL 以外のときは何もしない。同期（`_sync`）は `filepath` 列を読むため、列がない既存テーブルでは失敗する（本エミュレーターは `CREATE TABLE`（出力モード 3、既定）で作る列構成が前提。README に記載済みの制限として 03 に追記した）。

### 3. TSV の読み戻し（🟡）→ 対応済み

`parse_adapter_tsv` が、アダプタに渡した入力ファイルのパスで行の先頭を固定して読むようにした（`re.escape`）。パスに `"` が入っていても読める。`test_parse_adapter_tsv_reads_paths_with_quotes_when_source_is_known` で確認。

### 4. 削除で当たらない ID（🟡）→ 対応済み

行 ID またはファイル ID のどちらかに当たった行だけを削除対象にし、どちらにも当たらない ID（削除済みなど）は飛ばして警告ログを出す。以前は当たらない ID を「ファイル ID」として渡しており、何も削除しないのに成功扱いだった。server-local は削除済みのパート ID が再び来ても失敗にしない方が冪等に動くため、エラーにはしない。`test_delete_accepts_file_ids_and_skips_unknown_ids`・`test_delete_with_only_unknown_ids_deletes_nothing` で確認。

### 5. 空のチャンク（🟡）→ 対応済み（移植元から変更）

移植元は、先頭の行が分割文字数より長いと空の `sentence` のままチャンクを登録する（埋め込み API は空の入力を拒否し、取り込み（`IngestionCoreMapper`）も空本文を拒否するため、実際には失敗していた）。本文が空のチャンクは登録も TSV 出力もしない形に変えた。03 の「移植元から変えた点」に追記。`test_first_line_longer_than_split_length_does_not_create_empty_chunk` で確認。

### 6. 重複したチャンク処理（🔵）→ 対応済み

チャンクの書き込みを `write_chunk` にまとめ、状態を `_ChunkState` に持たせた。

### 7. `outputType` の型（🔵）→ 対応済み

`isinstance` の確認を所属判定より先に行い、list などは `WorkflowConfigError` にした（`test_embedding_definition_validation` に既存の不正値の例あり）。生成AIアダプタの定義の同じ書き方（#298 から）は今回の範囲外のため触っていない。

## 再テスト

```
$ cd generative-ai-adapter && uv run pytest -q
1368 passed, 3 skipped
$ uv run pytest embedding-adapter/tests -q
186 passed
$ cd waha-emulator && uv run pytest -q
169 passed
```

ruff・ruff format・mypy・NumPy docstring の D ルールも通した。修正後に実 DB（PostgreSQL + pgvector）で、エミュレーター経由の学習 → 同期 → 削除を再確認した（rows=2 → sync 2 行 → rows=0）。
