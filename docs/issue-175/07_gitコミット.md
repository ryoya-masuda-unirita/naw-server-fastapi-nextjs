# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-175/00`〜`07` |
| 2 | 並べ替えキー追加とテスト | `backend/app/repositories/file_repository.py`, `backend/tests/integration/test_files.py` |
| 3 | 動作確認記録 | `docs/issue-175/06`, `08` |

## 各コミットメッセージ案

```
#175 issue-175 学習データファイル並べ替え対応の設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.md を作成
```

```
#175 issue-175 学習データファイル一覧を更新者順・学習設定順で並べ替えられるようにする
    - _ORDER_BY_COLUMNS に userId・status を追加（移植元 Pageable と同じくエンティティ列で並べ替え）
    - 並べ替えの結合テストを追加
```

```
#175 issue-175 動作確認結果を記録
    - 08_動作確認.md に自動テスト結果を記録
```
