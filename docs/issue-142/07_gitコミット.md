# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1（cherry-pick） | mypy設定をdevelop未マージのIssue#140相当に先行反映（`feature/issue-141` の `1dfcde2` を cherry-pick、コミットメッセージは元のまま） | `backend/pyproject.toml`、`backend/tests/unit/test_azure_cost_client.py` |
| 2（cherry-pick） | mypy対象範囲に残る実バグ疑い2件を修正（`feature/issue-141` の `b081aa2` を cherry-pick、コミットメッセージは元のまま） | `backend/app/services/index_service.py`、`backend/app/services/message_service.py` |
| 3 | `docs/issue-142/` のドキュメント一式を作成 | `docs/issue-142/00_チケット内容.md`〜`08_動作確認.md` |
| 4 | backend CIにmypyチェックを追加 | `.github/workflows/backend-tests.yml` |

## 各コミットメッセージ案

コミット1・2は `feature/issue-141`（PR #145）からの cherry-pick のため、元のコミットメッセージ（`#141 issue-141 ...`）をそのまま使用する。前提となる #140/#141 の内容を `develop` 未マージのまま反映したものであることを明確にするための意図的な選択。

```
#142 issue-142 docs/issue-142のドキュメント一式を作成
    - 00_チケット内容〜08_動作確認を作成し、CIへのmypy組み込み方針を記録
```

```
#142 issue-142 backend CIにmypyチェックを追加
    - .github/workflows/backend-tests.ymlにmypyジョブを追加（lintジョブと同構成）
    - 実行コマンドはuv run mypy app testsで、既存のRuff/pytestジョブとは独立させた
```
