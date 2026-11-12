# code-review 結果

対象: PR #303（`/code-review medium 303`）

正しさに関わるバグの指摘は無かった（閲覧判定の切り出しで `get_library` の挙動が変わらないこと、ルートの衝突が無いこと、本文が NULL・空文字の扱いが移植元と同じことを確認済み）。テストの抜けの指摘 5 件はすべて対応した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `backend/tests/unit/test_library_service.py` | 閲覧できない場合に本文の有無を見ずに 404 `Library not found` になることを確かめていない | 対応済み |
| 2 | 🔵 提案 | `backend/tests/integration/test_libraries.py` | 本文が空文字の場合の結合テストが無い | 対応済み |
| 3 | 🔵 提案 | `backend/tests/integration/test_libraries.py` | 他テナントのライブラリが 404 になることを確かめていない | 対応済み（単体テスト） |
| 4 | 🔵 提案 | `backend/tests/unit/test_library_service.py` | 共通化した閲覧判定の、メッセージ・ルームが無い経路のテストが無い | 対応済み |
| 5 | 🔵 提案 | `backend/app/services/library_service.py` | 同上（メッセージ・ルームが無いときにライブラリの可視判定へ進む分岐） | 対応済み（4 と同じテスト） |

## 詳細

### 1. 閲覧できない場合の判定順（🔵 提案）→ 対応済み

`test_raises_library_not_found_before_checking_content` を追加した。本文が NULL のライブラリでも、閲覧できなければ `Library content not found` ではなく `Library not found` になる（閲覧できないユーザーにライブラリの存在を漏らさない）ことを固定する。

### 2. 本文が空文字（🔵 提案）→ 対応済み

`test_get_content_with_empty_content_returns_empty_string` を追加し、200・`{"data": ""}` を確かめる。

### 3. 他テナント（🔵 提案）→ 対応済み（単体テスト）

`test_raises_404_when_library_not_in_tenant` を追加し、テナント ID を条件にライブラリを探し、見つからなければ 404 `Library not found` になることを確かめる。結合テストで他テナントのライブラリを作るにはメッセージ・ルーム・アシスタントまで他テナントに作る必要があり、テナント条件は既存の `TestGetLibrary::test_get_library_other_tenant_returns_404` と共通の処理（`_get_library_or_404`）で担保されるため、単体テストにとどめた。

### 4・5. メッセージ・ルームが無い経路（🔵 提案）→ 対応済み

`test_falls_back_to_visibility_when_message_missing`（メッセージが無ければルームを探さずライブラリの可視判定で取得できる）、`test_falls_back_to_visibility_when_room_missing`（ルームが無くライブラリも見えなければ 404）を追加した。
