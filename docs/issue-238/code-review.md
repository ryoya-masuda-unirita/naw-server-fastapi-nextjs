# code-review 結果

PR #250 に対して `/code-review` を実行した結果。重大度は指摘内容から付けた。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/library_tag_service.py` | ライブラリタグ更新 API（PATCH）は不正な形式の ID で 404 を返すが、移植元は 400。本 PR の方針（`UUID.fromString` の失敗は 400）と食い違う | 対応しない |
| 2 | 🔵 提案 | `backend/app/core/library_tag_id.py` | 正規表現が、移植元の `UUID.fromString` が受け付ける桁を詰めた表記（`1-2-3-4-5` など）を拒否する | 対応しない |
| 3 | 🟡 注意 | `backend/app/core/library_tag_id.py` | エラーメッセージに入力値を長さの制限なく入れている。移植元は 37 文字以上だと `UUID string too large` | 対応済み |
| 4 | 🔵 提案 | `backend/app/routers/libraries.py` | ライブラリ一覧のタグ絞り込み（`tagIds: list[uuid.UUID]`）が共通の正規化処理を使っておらず、`urn:uuid:` 形式なども受け付ける | 対応しない |
| 5 | 🔵 提案 | `backend/app/services/library_tag_service.py` | 一括削除の ID 形式チェックは、サービスではなくリクエストのスキーマに書くべき | 対応しない |
| 6 | 🔵 提案 | `backend/tests/integration/test_libraries.py`、`test_library_tags.py` | 追加したテスト用ヘルパーの `session` に型ヒントが無く、docstring に Args/Returns が無い | 対応済み |
| 7 | 🔵 提案 | `backend/app/services/library_service.py` | `... if req.tags else []` の三項演算子は `req.tags or []` で簡潔に書ける | 対応済み |

🔴 致命的の指摘は無かった。

## 詳細

### 1. ライブラリタグ更新 API の不正な形式が 404（🟡 注意）→ 対応しない

#227 で、不正な形式のパスの ID は「存在しない ID と同じく 404」とすると決めた。ライブラリ API のパスの ID（`_parse_library_id`）も、移植元は `UUID.fromString` の失敗で 400 だが、このリポジトリでは 404 にしており、それと揃っている。本 Issue の対象はリクエスト本文で受け取るタグ ID の一覧（一括削除・ライブラリ更新）で、パスの ID の扱いを変えるとライブラリ API とも食い違うため、変えない。パスの ID の扱いを移植元（400）に揃えるなら、ライブラリ API とあわせて別 Issue で扱うのがよい（本 Issue では起票しない）。

### 2. 桁を詰めた表記を拒否する（🔵 提案）→ 対応しない

#227 の code-review で、1 つのタグを指す ID の表記が増えないよう、受け付ける表記を 2 形式に限ると決めた。画面はハイフンなしの ID を送るため、桁を詰めた表記が使われることは無い。`01_要件定義.md` のスコープ外に明記している。

### 3. エラーメッセージに入力値をそのまま入れる（🟡 注意）→ 対応済み

移植元の `UUID.fromString` と同じく、37 文字以上の値は中身を含めず `UUID string too large` にし、それ以外は `Invalid UUID string: <値>` にした（`_invalid_uuid_message`）。巨大な値がそのまま応答に返ることは無くなった。単体テスト `test_normalize_ids_with_too_long_id_omits_value` を追加した。

### 4. 一覧のタグ絞り込みが共通処理を使っていない（🔵 提案）→ 対応しない

一覧の絞り込みは #173 で対応済みで、ハイフン付き・なしとも受け付け、不正な形式は 400 になる（`02_基本設計.md` の横展開）。`urn:uuid:` 形式なども受け付けるのは絞り込み（読み取り）だけで、保存される値の表記が増えるわけではない。受け方を変えると不正な形式のメッセージが変わるため、本 Issue では変えない。

### 5. 形式チェックをスキーマに書くべき（🔵 提案）→ 対応しない

ライブラリ更新では、移植元と同じ順（所有者の確認 → タグの形式）にするため、サービスの中で確認する必要がある（スキーマで確認すると 403・404 より先に 400 になる）。一括削除だけスキーマで確認すると、同じタグ ID の正規化が 2 か所の別の方法になるため、両方ともサービスから共通の処理を呼ぶ形にそろえた（`02_基本設計.md` の案 B）。

### 6. テスト用ヘルパーの型ヒント（🔵 提案）→ 対応済み

`_remaining_tag_ids`・`_mapped_tag_ids` の `session` に `AsyncSession` の型ヒントを付け、docstring に Args/Returns を追加した。

### 7. 三項演算子の簡略化（🔵 提案）→ 対応済み

`list(dict.fromkeys(normalize_library_tag_ids(req.tags or [])))` にした。
