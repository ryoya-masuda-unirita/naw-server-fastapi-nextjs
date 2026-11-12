# code-review 結果

対象: PR #234（`/code-review 234` を実行）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/repositories/assistant_repository.py`・`index_repository.py`・`group_assistant_repository.py` | `type` 順が PostgreSQL のネイティブ ENUM の宣言順になり、移植元（varchar の文字列順）と逆転する | 対応しない（別 Issue 候補） |
| 2 | 🟡 注意 | `backend/app/repositories/assistant_repository.py`・`group_assistant_repository.py`・`index_repository.py` | `name` 順が大文字小文字を区別する。移植元は区別しない | 対応しない（別 Issue 候補） |
| 3 | 🟡 注意 | `backend/app/core/sort.py` | 末尾の `ignorecase`（`sort=name,desc,ignorecase`）で方向が無視され、`desc`・`ignorecase` が未知のキーとして並べ替えに加わる | 対応済み |
| 4 | 🟡 注意 | `backend/app/core/sort.py` | 未知のキーを読み替え先の列に置き換えて同じ位置に残すため、複数指定で後ろの既知のキーの優先度が下がる。移植元は未知のキーを読み飛ばす | 対応済み |
| 5 | 🔵 提案 | `backend/app/services/user_service.py`・`group_user_repository.py` | `totalCredits` の位置に関係なく利用クレジットを第 1 キーにし、他の指定を捨てている。分岐が 2 か所に重複 | 対応しない |
| 6 | 🔵 提案 | `backend/app/core/sort.py` | `tie_breaker_ascending` で最終キーの向きが 2 通りある。1 つに統一すれば引数をなくせる | 対応しない |

（code-review の出力は 7 件。うち `name` の大文字小文字を区別する 3 ファイルの指摘を #2 にまとめたため 6 件とした）

## 詳細

### 1. `type` 順が ENUM の宣言順になる（🟡 注意）→ 対応しない（別 Issue 候補）

マイグレーションを確認した。`assistants.type` は `sa.Enum(..., name="assistanttype")`（PostgreSQL のネイティブ ENUM）で、指摘のとおり宣言順に並ぶ。

ただし、この差は本 PR で入ったものではない。変更前から `Assistant.type`・`Index.type` をそのまま並べ替えに使っており、本 PR は解釈処理を共通化しただけで、列の定義は変えていない。Issue #225 の指摘範囲（解釈の共通化・最終キー・不正 role・SYSTEM 除外）にも入っていない。また、PR 作成時の指示「既存 API の挙動を変えない」に沿い、並び順そのものを変える修正は本 PR に混ぜない。

テスト DB（SQLite）は ENUM を文字列で保持するため、結合テストではこの差を検出できない。ユーザーの `role` と同じく `CAST(... AS VARCHAR)` で揃える修正を、別 Issue として起票するようユーザーに提案する。

### 2. `name` 順が大文字小文字を区別する（🟡 注意）→ 対応しない（別 Issue 候補）

`01_要件定義.md` のスコープ外に明記した事項。変更前からある差で、指摘 1 と同じ理由で本 PR では変えない。チーム所属ユーザー一覧だけは #181 で `lower(name)` にした経緯があり、その他の一覧は別 Issue でまとめて揃えるのがよい。

### 3. 末尾の `ignorecase` で方向が失われる（🟡 注意）→ 対応済み

本 PR で入った解釈処理の不具合なので修正した。`parse_sort` で、末尾の要素が `ignorecase`（大文字小文字無視）なら読み飛ばしてから方向を解釈する。

- `sort=name,desc,ignorecase` は `name` 降順になる
- 大文字小文字を区別するかどうかは、各 API の列の定義に従う（`ignorecase` 自体は適用しない。フロントエンドは送らない）

単体テスト `test_skips_trailing_ignorecase_option` を追加した。

### 4. 未知のキーが後ろの既知のキーの優先度を下げる（🟡 注意）→ 対応済み

複数指定に対応したことで生じた差なので修正した。`build_order_by` で、対応表にないキーは読み飛ばす（移植元の `IndexService.applySort`・`GroupUserSpecification.toOrder` と同じ）。

- 対応表にあるキーが 1 つもない場合だけ、先頭の指定の方向で読み替え先の列に並べる。単一指定（`sort=foo,desc` など）の従来の挙動は変わらない
- 最終キーの方向は、実際に並べる先頭の列の方向に合わせた

単体テスト `test_skips_unknown_properties_when_known_exists`・`test_falls_back_when_no_known_property` を追加した。既存の結合テスト（未知キーで読み替え先に並ぶことの確認を含む）もすべて通った。

### 5. `totalCredits` の位置と分岐の重複（🔵 提案）→ 対応しない

利用クレジット順の並びは「クレジット合計 → 表示名昇順 → ID」で、#172 の code-review で「移植元の API 仕様なので変えない」と決めた例外。

対応表に入れて `build_order_by` に渡すと、表示名昇順の副次キーがなくなり、既存の挙動が変わる。移植元でも、`totalCredits` と他のキーを同時に指定したときの並びは Specification と Pageable の組み合わせに依存する特殊な挙動で、フロントエンドは `totalCredits` を単独でしか送らない。分岐の重複は変更前からあり、本 PR の目的（解釈の共通化）からは外れるため、そのまま残す。

### 6. 最終キーの向きが 2 通り（🔵 提案）→ 対応しない

#170（管理者向けテンプレート一覧）・#175（学習データファイル一覧）は、最終キーを常に ID 昇順にしてマージ済み。PR 作成時の指示「既存の API の挙動を変えない」に従い、この 2 本の挙動を維持するために引数を残した。向きを統一するかどうかは、ユーザーの判断を仰ぐ事項として PR に記載した。
