# code-review 結果

PR #323 に対して `/code-review`（high）を実行した結果。🔴 は 1 件で、修正済み。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `waha-emulator/waha_emulator/workflows/generative_ai.py` | 添付が textData・履歴と同じディレクトリに書かれ、同名の添付（`textData.json` など）で検証済みのファイルを上書きできる（`STREAM_ALLOWED_DIR` の制限を回避できる） | 対応済み |
| 2 | 🟡 注意 | `waha-emulator/waha_emulator/workflows/generative_ai.py` | execute の `streamfilepath` を検証前のパスのままアダプタへ渡すため、検証後にシンボリックリンクへ差し替えられるとアダプタが別のファイルへ追記する | 対応済み（execute のパス）。textData の `streamfilepath` は対応しない |
| 3 | 🟡 注意 | `waha-emulator/waha_emulator/workflows/generative_ai.py` | `endsession` などでジョブを止めても、アダプタを動かしている別スレッドは最後まで動き、error の後にも途中経過を書く | 対応しない |
| 4 | 🟡 注意 | `generative-ai-adapter/.../reasoning_output_sink.py` | 8 KB を超える 1 行は複数回の write に分かれ、server-local が書きかけの行を読むおそれがある | 対応済み |
| 5 | 🟡 注意 | `generative-ai-core/.../network/transport.py` | タイムアウトが読み取りごとで、リクエスト全体の期限になっていない | 対応しない |
| 6 | 🟡 注意 | `generative-ai-core/.../network/transport.py` | IPv6 の手動プロキシのホストを角括弧で囲まずに URL にしている | 対応済み |
| 7 | 🔵 提案 | `waha-emulator/waha_emulator/workflows/generative_ai.py` | `streamfilepath` の定数が jobs.py と重複している | 対応済み |
| 8 | 🔵 提案 | `waha-emulator/waha_emulator/workflows/generative_ai.py` | ログ用のプロパティ名の辞書をジョブごとに作り直している | 対応済み |

## 詳細

### 1. 添付のファイル名の衝突（🔴 致命的）→ 対応済み

textData の `streamfilepath` は、アダプタが渡す前にエミュレーターが `STREAM_ALLOWED_DIR` の中かを確かめている。しかし、確かめた textData のファイル（`textData.json`）と添付が同じ一時ディレクトリに書かれるため、`textData.json` という名前の添付を一緒に送ると、確かめたファイルが上書きされ、アダプタは確かめていないファイルを読む。履歴（`histories.json`）も同じ。

添付を専用のサブディレクトリ `attachments/` に書くようにし、固定名のファイルと衝突しないようにした。回帰テスト `test_build_adapter_job_attachment_cannot_overwrite_fixed_files` を追加（`textData.json`・`histories.json` が上書きされず、添付は別の場所に書かれる）。

### 2. streamfilepath の検証後の差し替え（🟡 注意）→ 対応済み（execute のパス）

execute の `streamfilepath` は、検証で解決した後のパス（シンボリックリンクを辿った実体）をプロパティ 42 に渡すようにした。回帰テスト `test_build_adapter_job_passes_resolved_stream_path`・`…rejects_stream_path_outside_allowed_dir` を追加。

textData の `streamfilepath` は、textData の中身をそのまま渡す（書き換えない）ため、検証と使用の間の差し替えは防げない。ただし、検証はこのエミュレーターの確認用の入口であり、書き込めるのは `STREAM_ALLOWED_DIR`（Docker では server-local と共有するディレクトリ）に書ける同じ権限の主体だけで、差し替えには共有ディレクトリへの書き込みが要る。移植元のアダプタ自体も同じ作り（パスを開くだけ）で、textData の書き換えは移植元の振る舞いと食い違うため、対応しない。

### 3. キャンセル後のスレッド（🟡 注意）→ 対応しない

アダプタは移植元と同じ同期処理で、途中で止める仕組みがない（移植元の Java も、Waha! がジョブを止めても `write` の中の通信は続く）。止めるには、core の通信（`httpx`）とアダプタの全体に中断の確認を通す必要があり、移植の範囲を超える。影響は、`endsession` 後にスレッドが LLM の呼び出しを終えるまで動き続け、ストリームファイルに（`error` の後に）途中経過が追記されることと、一時ディレクトリの削除が遅れることで、server-local は終端（`error`）を見たら読み取りを止める。echo・非ストリーミングの OpenAI・Azure では短時間で終わる。必要になったら、アダプタの外から止められる仕組み（中断フラグ）を別の Issue で足す。

### 4. 途中経過の 1 行の書き込み（🟡 注意）→ 対応済み

ファイルを開くときのバッファを 1 MiB にし、`flush` のたびに 1 行が 1 回の書き込みになるようにした（1 MiB を超える 1 行だけは分かれる）。移植元（`BufferedWriter`）はバッファが 8 KB で同じ問題があるが、server-local が書きかけの行を読まないほうが望ましいため直した。回帰テスト `test_default_open_flushes_a_long_line_with_a_single_write`（約 300 KB の 1 行が 1 行として書かれる）を追加。

### 5. タイムアウトの意味（🟡 注意）→ 対応しない

移植元の Apache HttpClient の `responseTimeout` も、1 回の読み取り（ソケット）ごとの期限で、リクエスト全体の期限ではない。`httpx` の `Timeout` も同じ意味で、同じ秒数を接続・読み取り・書き込み・プール待ちに当てているのも移植元（接続・応答・接続要求の 3 つに同じ値）と揃っている。

### 6. IPv6 の手動プロキシ（🟡 注意）→ 対応済み

ホストに `:` を含み角括弧がなければ、`[ホスト]` にして URL にするようにした。回帰テスト `test_ipv6_manual_proxy_host_is_bracketed_in_proxy_url` を追加。

### 7. 定数の重複（🔵 提案）→ 対応済み

ワークフローの `streamfilepath` の定数を削除し、`jobs.py` の定数を使う。textData の JSON の項目名（`streamfilepath`）は別のもの（アダプタの textData の仕様）のため、そのままにした。

### 8. ログ用の辞書（🔵 提案）→ 対応済み

プロパティ ID → 名前の辞書を、一度だけ作る（`functools.cache`）ようにした。

## 修正後のテスト結果

```
$ cd generative-ai-adapter && uv run pytest -q
768 passed in 7.51s
$ cd waha-emulator && uv run pytest -q
132 passed in 2.26s
$ cd server-local && uv run pytest -q
179 passed in 5.44s
```

ruff（check・format）・mypy・NumPy 形式の docstring の検査（D ルール）はすべてエラーなし。
