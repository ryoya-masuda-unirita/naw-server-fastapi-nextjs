# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-236/00`〜`07` |
| 2 | ENUM 列の並べ替えを文字列順にする実装とテスト | `backend/app/core/sort.py`、各リポジトリ、`backend/app/services/user_service.py`、`backend/tests/unit/test_sort.py`、`backend/tests/integration/test_enum_sort_cast.py` |
| 3 | 動作確認結果 | `docs/issue-236/06_タスクリスト.md`、`08_動作確認.md` |
| 4 | code-review 結果と対応 | `docs/issue-236/code-review.md` ほか |

## 各コミットメッセージ案

```text
#236 issue-236 設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```text
#236 issue-236 ENUM列の並べ替えを移植元と同じ文字列順にする
    - sort.pyにネイティブENUM列を文字列にキャストするenum_as_stringを追加
    - アシスタント・グループのアシスタント・インデックス一覧の種別の並べ替えに適用
    - フィードバックのルーム・メッセージ一覧の評価の並べ替えにも横展開
    - ユーザー一覧の権限の並べ替えを共通の部品に置き換え
    - PostgreSQL方言のSQLにCASTが入ることを確認するテストを追加
```

```text
#236 issue-236 動作確認結果を記録
    - 08_動作確認.mdにpytest・mypy・ruffの結果を記録
```
