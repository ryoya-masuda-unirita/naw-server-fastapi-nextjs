# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `backend/app/services/index_service.py` | `assert room_id is not None`は`python -O`実行時に無効化されるため、本番運用でこのオプションを使う場合は保護されなくなる | 対応しない（現状のデプロイ構成で`-O`/`PYTHONOPTIMIZE`は使用されておらず、既存の`tenant_service.py`と同じ設計パターン） |

## 詳細

### 1. `assert`によるNarrowingは`python -O`実行時に無効化される（🔵 提案）→ 対応しない

`index_service.py`の`additional_learning`に追加した`assert room_id is not None`は、直前の`learning_source_not_specified`/`confused_learning_source`チェックにより実行時には必ず成立する不変条件だが、Pythonの`assert`文は`-O`（最適化モード）または`PYTHONOPTIMIZE`環境変数で起動した場合にすべて無効化される仕様上の制約がある。

**対応しない理由:**

- リポジトリ内のDockerfile・起動コマンド・CI設定を確認したが、`-O`/`-OO`/`PYTHONOPTIMIZE`はどこにも使用されておらず、現状の運用ではこの制約は顕在化しない
- 同様の「バリデーション済みの不変条件をmypyに伝えるための`assert`」パターンが`app/services/tenant_service.py:102`（`assert request.tenantName is not None`）に既に存在し、本PRはこの既存パターンを踏襲したものである。個別Issueで方針を変えるのではなく、`assert`によるNarrowingを使わない方針にするなら、既存箇所も含めて横断的に見直すべき事項であり、本Issueのスコープ外と判断した
- 万一この不変条件が破れるケース（呼び出し元のバグ等）が将来発生した場合も、`AssertionError`は握り潰されず例外として伝播するため、「silent」に不正な値を渡してしまうよりは安全側に倒れている

以上より、致命的な指摘はなし。型修正による非回帰は`docs/issue-141/08_動作確認.md`の通り、`uv run mypy app tests`（0件）・`uv run pytest tests/unit -q`（249件成功）・`uv run ruff check app tests`（検出なし）で確認済み。
