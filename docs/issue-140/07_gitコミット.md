# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | `docs/issue-140/` のドキュメント一式を作成 | `docs/issue-140/00_チケット内容.md`〜`08_動作確認.md` |
| 2 | mypy設定を段階導入向けに整備 | `backend/pyproject.toml`、`backend/tests/unit/test_azure_cost_client.py` |

## 各コミットメッセージ案

```
#140 issue-140 docs/issue-140のドキュメント一式を作成
    - 00_チケット内容〜08_動作確認を作成し、mypy設定整備の方針を記録
```

```
#140 issue-140 backend mypy設定を段階導入向けに整備
    - [tool.mypy]にfiles/python_version/warn_unused_ignores/warn_redundant_castsを追加
    - SQLModel/SQLAlchemy型推論の構造的エラーが集中するapp.repositories.*等を理由付きで除外
    - warn_unused_ignoresで検出した不要なtype: ignoreをtest_azure_cost_client.pyから削除
```
