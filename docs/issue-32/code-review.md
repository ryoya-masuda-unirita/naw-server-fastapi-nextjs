# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `.github/workflows/backend-tests.yml` | `uv sync`が`--locked`なしで実行されており、`pyproject.toml`と`uv.lock`がズレていても静かに再解決してしまう | 対応済み |
| 2 | 🔵 提案 | `.github/workflows/backend-tests.yml` | `unit-tests`と`integration-tests`のステップがほぼ重複している | 対応しない |

## 詳細

### 1. `uv sync`のlockfileズレ検知漏れ（🟡 注意）→ 対応済み

`uv sync`は`--locked`（または`--frozen`）を付けない場合、`pyproject.toml`の内容が`uv.lock`と一致していなければ黙って`uv.lock`を再解決してしまう。これにより、依存関係のバージョンを変更したのに`uv lock`の実行・コミットを忘れた場合でも、CIはズレに気づかず通ってしまい、後で別環境（ローカル開発等）で異なるバージョンがインストールされて問題が発覚する、というリスクがある。

`uv sync --locked`に変更し、`uv.lock`が`pyproject.toml`と一致しない場合はCIが即座に失敗するようにした。ローカルで`uv sync --locked`を実行し、現在のlockfileが同期済みで問題なく通ることを確認した。

### 2. `unit-tests`と`integration-tests`のステップ重複（🔵 提案）→ 対応しない

`checkout`・`setup-uv`・`setup-python`・`.env`準備・`uv sync`の5ステップが両ジョブでほぼ同一。Composite Action化やmatrix戦略で共通化できるが、ジョブが2つのみの現状では重複のコストは小さく、可読性を優先してそのままにする。将来ジョブが増える場合に再検討する。
