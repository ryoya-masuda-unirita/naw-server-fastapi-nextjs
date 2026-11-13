# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `feedback_service.py` | ルームIDを一度 Python に取り込み `IN (...)` で戻す 2 往復の方式。巨大なフォルダではバインド変数の上限に当たりうる | 対応しない |
| 2 | 🟡 注意 | `feedback_service.py` | `folderId` が空文字のときの扱いがメッセージ評価一覧と異なる | 対応しない（移植元を確認済み） |
| 3 | 🔵 提案 | `room_repository.py` | 空リストの `IN` の挙動とコメントの表現 | 対応しない |
| 4 | 🔵 提案 | `file_repository.py` | ファイルのステータスを問わず対象にしている | 対応しない（移植元と同じ） |
| 5 | 🔵 提案 | `room_repository.py` | `room_ids` の None と空リストの意味の違い | 対応しない |
| 6 | 🔵 提案 | `test_feedback.py` | テストの網羅 | 対応しない |

🔴 致命的は 0 件。

## 詳細

### 1. 2 往復の方式（🟡）→ 対応しない

移植元 `FeedbackService.getFeedbackRooms` は、`fileRepository.findRoomIdsByIndexId` で先にルームIDの一覧を取り、`root.get("id").in(folderRoomIds)` で絞り込む。同じ構造に揃えるのが Issue の目的（完璧なクローン）で、結果も同一になる。1 つのフォルダに紐づく評価済みルームではなく、ファイルを持つルーム全体が対象のため大きくなりうる点は認識しているが、現状の規模では問題にならない。巨大化した場合は副問い合わせへの置き換えを別 Issue で検討する。

### 2. 空文字の扱い（🟡）→ 対応しない

移植元は `StringUtils.isNotEmpty(folderId)` で判定しており、空文字は絞り込まない（`server/.../service/FeedbackService.java` で確認）。メッセージ評価一覧（`feedbackMessage`）の挙動は本 Issue の範囲外で変えない。`02_基本設計.md` に判断を記載済み。

### 3. 空リストの `IN`（🔵）→ 対応しない

SQLAlchemy 2 は空リストの `IN` を常に偽の式にコンパイルする。`test_folder_id_without_files_returns_no_rooms` が空の場合の 0 件を確かめている。コメントの表現は実際の挙動に近い言い方に修正する余地があるが、意味は変わらない。

### 4. ファイルのステータス（🔵）→ 対応しない

移植元の `findRoomIdsByIndexId` は `index_id`・`tenant_id`・`room_id IS NOT NULL` だけで、ステータスを見ない（`FileRepository.java` で確認）。揃えている。

### 5. None と空リスト（🔵）→ 対応しない

移植元も「null は条件なし、空は 0 件」の同じ意味で、呼び出し元は 1 か所。docstring に明記している。

### 6. テストの網羅（🔵）→ 対応しない

指摘が確認していない点がある。実際には、絞り込み・該当なし・空文字・`rating` との併用・ルームIDの重複と NULL の除外・他テナントの除外を、結合テストとリポジトリのテストで確かめている。
