# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-307/00`〜`07` |
| 2 | モデル・マイグレーション・リポジトリ | `backend/app/models/library.py`、`backend/alembic/versions/issue307_split_library_contents.py`、`backend/app/repositories/library_repository.py`、`backend/app/repositories/library_content_repository.py`、`backend/app/repositories/assistant_endpoint_repository.py` |
| 3 | API・ライブラリ生成 | `backend/app/schemas/library.py`、`backend/app/services/library_service.py`、`backend/app/routers/libraries.py`、`backend/app/services/message_service.py`、`backend/app/services/llm_chat_service.py` |
| 4 | テスト | `backend/tests/**` |
| 5 | 動作確認の記録 | `docs/issue-307/06`・`08` |

コミット 2〜4 は単独ではテストが通らないため、実際は 2〜4 を 1 つにまとめてよい。

## 各コミットメッセージ案

```
#307 issue-307 ライブラリ本文の分割の設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```
#307 issue-307 ライブラリ本文をlibrary_contentsテーブルに分けて移植元に揃える
    - library_contentsのモデルとマイグレーション(既存本文の移行・戻し)を追加
    - libraries.titleをNULL可にしcontent列を削除
    - 一覧・ルーム一覧からタイトルNULLのスタブを除く
    - ライブラリ詳細の応答を移植元の項目(assistant・hasNawContent等)にする
    - スタブ作成・タイトル更新APIを追加
    - ライブラリ生成でライブラリと本文をまとめて保存する
    - 単体・結合テストを追加・更新し、触ったファイルのdocstringをNumPy形式にする
```

```
#307 issue-307 動作確認結果を記録
    - 自動テストの結果を08_動作確認.mdに記載
```
