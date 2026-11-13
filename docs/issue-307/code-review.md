# code-review 結果

対象: PR #318（`/code-review medium 318`）。🔴 致命的の指摘は無し。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/library_service.py` | ライブラリ詳細の `apiKey` が、ルームを閲覧できるだけのユーザーにも返る | 対応しない（移植元どおり） |
| 2 | 🟡 注意 | `backend/app/services/library_service.py` | スタブ作成が同じ `messageId` に何度でもスタブを作れる | 対応しない（移植元どおり） |
| 3 | 🟡 注意 | `backend/app/services/library_service.py` | メッセージが無いとき `assistant` が null で 200 を返す | 対応しない（移植元どおり） |
| 4 | 🟡 注意 | `backend/alembic/versions/issue307_split_library_contents.py` | `down_revision` が `023` に固定で、他 PR とのマージ順でヘッドが 2 つになりうる | 対応しない（運用ルールどおり。PR 本文に明記） |
| 5 | 🟡 注意 | `backend/alembic/versions/issue307_split_library_contents.py` | downgrade でスタブが既定タイトルの通常ライブラリとして残る | 対応しない（設計どおり。docs に明記） |
| 6 | 🟡 注意 | `backend/app/repositories/library_repository.py` | `create_with_content` が失敗時にロールバックしない | 対応済み |
| 7 | 🟡 注意 | `backend/app/services/library_service.py` | タイトル更新が本文確定済みのライブラリにも効く | 対応しない（移植元どおり） |
| 8 | 🔵 提案 | `backend/app/repositories/library_content_repository.py` | 存在確認のために本文全文を読んでいる | 対応済み |
| 9 | 🔵 提案 | `backend/app/schemas/library.py` | ルーム一覧のレスポンスの `title` が `str` のまま | 対応しない（指摘の誤り。既に `str \| None` にしている） |

## 詳細

### 1. `apiKey` の返し方（🟡 注意）→ 対応しない

移植元 `LibraryGetResponse#toAssistantResponse` は、閲覧権限の確認（`requireReadableLibrary`）を通ったユーザーに対し、SECURE かつ LOCAL_SERVER のエンドポイントの `apiKey` を返す。メッセージ一覧 API（`GetMessagesResponse`）も backend・移植元とも同じ条件で返す。クライアントはこのキーでローカルサーバーから本文を取るため、返さないと本文を取得できない。目標が移植元のクローンのため、そのままにする。

### 2・3・7. 移植元と同じ挙動（🟡 注意）→ 対応しない

- 2: 移植元 `createLibraryStub` も、同じメッセージ ID の既存スタブを確認しない。スタブは一覧に出ないため、溜まっても画面には影響しない
- 3: 移植元 `getLibrary` も、メッセージが無いとき `assistant` を null にして返す
- 7: 移植元 `updateLibraryTitle` も、書き込み権限（ルームの所有者）以外は検査しない

### 4. マイグレーションのヘッド（🟡 注意）→ 対応しない

共通ルール（`down_revision` は origin/develop の head、revision ID は `issue307`）に従っている。他の未マージ PR とマージ順によって付け替えが必要なことを、ファイルの docstring と PR 本文に明記した。

### 5. downgrade のスタブ（🟡 注意）→ 対応しない

戻した後のスキーマは `title` が必須で、スタブ（タイトル NULL）を表せない。行を消すと、ローカルサーバーが後でタイトルを送る先が無くなるため、既定のタイトル `ライブラリ` を入れて残す設計にした（`02_基本設計.md`・`03_詳細設計.md`）。

### 6. `create_with_content` のロールバック（🟡 注意）→ 対応済み

`flush` や `commit` が失敗したとき `session.rollback()` してから例外を送出するようにした。flush 済みのライブラリだけが同じセッションに残るのを防ぐ。単体テスト `test_rolls_back_when_saving_content_fails` で、コミット失敗時にロールバックされることを確かめる。

### 8. 存在確認の読み込み（🔵 提案）→ 対応済み

`exists_by_library_id_and_tenant_id` が本文を読まず、主キーだけを取得するようにした。

### 9. ルーム一覧の `title` の型（🔵 提案）→ 対応しない

`LibraryListItemResponse.title`・`LibraryPageItemResponse.title` はどちらも `str | None` に変えてあり、指摘の前提が誤っている。
