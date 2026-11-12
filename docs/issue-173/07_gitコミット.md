# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント作成 | `docs/issue-173/00`〜`07` |
| 2 | タグ絞り込みの型不一致を修正しテストを追加 | `backend/app/repositories/library_repository.py`、`backend/tests/unit/test_library_repository.py`、`backend/tests/integration/test_libraries.py` |
| 3 | 動作確認結果を記録 | `docs/issue-173/06_タスクリスト.md`、`docs/issue-173/08_動作確認.md` |
| 4 | code-review 結果を記録 | `docs/issue-173/code-review.md` |

## 各コミットメッセージ案

```
#173 issue-173 設計ドキュメントを作成
    - docs/issue-173 に 00〜07 を作成
```

```
#173 issue-173 ライブラリ一覧のタグ絞り込みで varchar = uuid になる不具合を修正
    - find_page で tagIds を DB 保存形式（32桁hex文字列）に変換してから比較する
    - asyncpg 方言でのバインド型・値を検証する単体テストを追加
    - ハイフン付き形式・他タグ除外・不正値の結合テストを追加
```

```
#173 issue-173 動作確認結果を記録
    - 08_動作確認.md に pytest 結果を記録
```

```
#173 issue-173 code-review 結果を記録
    - code-review.md を作成
```
