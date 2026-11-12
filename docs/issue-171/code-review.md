# code-review 結果

対象: PR #218（`/code-review 218` を実行）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `backend/app/schemas/prompt_template.py` | 空文字・空白だけのテンプレート名が通る | 対応しない |
| 2 | 🔵 提案 | `backend/app/schemas/prompt_template.py` | DB の `DataError` を共通の例外ハンドラで 400/422 にすれば、他の項目も含めて一括で直せる | 対応しない |
| 3 | 🔵 提案 | `backend/app/schemas/prompt_template.py` | スキーマがモデルの定数を import している。既存の書き方（スキーマ側で定数を持つ）と違う | 対応しない |
| 4 | 🔵 提案 | `backend/app/models/prompt_template.py` | `NAME_MAX_LENGTH` は他モジュール（255）と同名で紛らわしい | 対応しない |
| 5 | 🟡 注意 | `backend/tests/integration/test_prompt_templates.py` | テスト用ヘルパー `_template_body` に型ヒントがない | 対応済み |
| 6 | 🔵 提案 | `backend/tests/integration/test_prompt_templates.py` | SQLite でしか動かしておらず、PostgreSQL の文字数の数え方との一致は確かめていない | 対応しない |
| 7 | 🟡 注意 | `docs/issue-171/02_基本設計.md` | 画面は100文字まで入力でき、保存に失敗する症状（理由の出ないトースト）は残る | 対応しない（方針どおり） |
| 8 | 🔵 提案 | `docs/issue-171/06_タスクリスト.md` | PR 作成・code-review が未チェックで、`code-review.md` が無い | 対応済み |

🔴 致命的: 0 件

## 詳細

### 1. 空文字・空白だけの名前（🔵 提案）→ 対応しない

移植元のエンティティは `@NotNull` だけで、空文字は受け付ける（`@NotBlank` ではない）。本 Issue は上限の不一致が対象で、下限・空白の扱いはスコープ外のため、移植元と同じ挙動のままにする。

### 2. DB エラーの共通ハンドラ（🔵 提案）→ 対応しない

全 API の例外処理に影響する変更で、本 Issue（テンプレート名の上限）のスコープを超える。対応するなら別 Issue で扱う。

### 3. スキーマからモデルの定数を import（🔵 提案）→ 対応しない

既存のスキーマにも `app.models` を import するものが複数ある（`user.py`・`assistant.py`・`index.py` など）。上限値を DB カラム定義と同じ定数にして、両者がずれないようにするのが目的（`01_要件定義.md` 機能要件5）。マイグレーション `007` の `sa.String(32)` は過去の履歴なので、定数に置き換えない。

### 4. 定数名 `NAME_MAX_LENGTH`（🔵 提案）→ 対応しない

`library.py`・`library_tag.py`・`assistant_category.py` も、モジュールごとに `NAME_MAX_LENGTH` を定義している。それに揃えた。参照するときは常に `app.models.prompt_template` から明示的に import するため、取り違えは起きにくい。

### 5. テスト用ヘルパーの型ヒント（🟡 注意）→ 対応済み

`def _template_body(name: str) -> dict[str, str | None]:` に修正した。

### 6. PostgreSQL での確認（🔵 提案）→ 対応しない

テストはインメモリ SQLite で動かす方針（共有の PostgreSQL は使わない）。Pydantic の `max_length` も PostgreSQL の `varchar(n)` も、文字（コードポイント）単位で数える。33文字以上は DB に届く前に 422 で返るので、DB 側の挙動には依存しない。`08_動作確認.md` の未確認事項に記載済み。

### 7. 画面上の症状が残る（🟡 注意）→ 対応しない（方針どおり）

Issue のコメントで提示した案 C の短所（「画面で100文字まで入力でき、保存に失敗する症状は残る」）として、ユーザーが了承したうえで選んだ方針。`frontend-angular/` は削除方針のため変更しない。バックエンドの変更で、原因の分からない 500 が、項目とエラー内容の分かる 422 になる。

### 8. タスクリストと code-review.md（🔵 提案）→ 対応済み

`06_タスクリスト.md` の PR 作成・code-review の項目をチェックし、本ファイルを作成した。
