# code-review 結果

PR #259 に対して `/code-review`（high）を実行した結果。致命的なバグ（🔴）は無し。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/core/validation_messages.py` ほか | `not_blank` は文言を差し替えるだけで空白を弾かず、docstring から空白を弾くものと誤解される | 対応済み（説明の修正） |
| 2 | 🟡 注意 | `backend/app/schemas/token_usage.py` | backend は日付だけ・UNIX 秒の from・to も受け付けるため、形式の文言が移植元ほど出ない。docs に差分が無い | 対応済み（docs に明記） |
| 3 | 🟡 注意 | `backend/app/core/validation_messages.py` | 1 件でも置き換えると全エラーを作り直し、置き換えないエラーの `ctx`・`url` が消える | 対応済み |
| 4 | 🔵 提案 | `backend/app/core/validation_messages.py` | `RequestModel` を継承し忘れても警告が無く、欠落だけ英語に戻る | 対応済み |
| 5 | 🔵 提案 | `backend/app/core/validation_messages.py` | 欠落エラー 1 件ごとに別名表を作り直している | 対応済み |
| 6 | 🔵 提案 | `backend/app/schemas/assistant.py` ほか | 文言に上限値がリテラルで入り、定数と二重管理 | 対応済み |
| 7 | 🔵 提案 | `backend/app/routers/libraries.py` | 入力チェックの文言をルーターに直接書いており、規約（バリデーションは `schemas/`）に反する | 対応済み |
| 8 | 🔵 提案 | `backend/app/schemas/token_usage.py`・`backend/app/routers/libraries.py` | ページ番号の制約と文言が 2 か所に重複 | 対応しない |
| 9 | 🔵 提案 | `backend/.claude/CLAUDE.md` | 新しい規約の直後に、`BaseModel` のまま日本語の必須文言を投げる例が Good として残っている | 対応済み |
| 10 | 🔵 提案 | `backend/app/core/validation_messages.py` | 検証が成功するときも項目・モデルごとに Python の wrap 関数の呼び出しが挟まる | 対応しない |

## 詳細

### 1. `not_blank` が空白を弾かない（🟡 注意）→ 対応済み（説明の修正）

制約の差分（移植元にあって backend に無い空白のみの拒否）は、01 のスコープ外に書いたとおり本 Issue では追加しない（受け付ける値が変わるため）。誤解を防ぐため、`ValidationMessages` の docstring に「文言を置き換えるだけで制約は追加しない。弾くには `Field(min_length=1)` や独自チェックを別に書く」と明記し、`not_blank` の説明を「空白のみの値が弾かれたとき」に直した。02 の「移植元と完全には一致しない点」にも、空白のみを受け付ける項目を列挙した。なお、指摘の例のパスワードリセットは、その後 develop から取り込んだ #260 で空白のみも 400 で拒否するようになった（03 の「develop の取り込み」）。

### 2. from・to で受け付ける形式の差（🟡 注意）→ 対応済み（docs に明記）

受け付ける値を変えるのは制約の差分で、本 Issue の対象外。02 の「移植元と完全には一致しない点」に、backend は日付だけの値・UNIX 秒も受け付け、形式の文言は日時として解釈できない値のときだけ返ることを追記した。

### 3. 作り直しで `ctx` が消える（🟡 注意）→ 対応済み

置き換えないエラーのうち Pydantic 組み込みの種類（`pydantic_core.core_schema.ErrorType`）は、元の種類と `ctx` のまま作り直すようにした（`url` も再生成される）。独自の種類（`PydanticCustomError`）は従来どおり元の文言で作り直す。`test_kept_error_context_is_preserved` で、他の項目の置き換えがあっても `value_error` の `ctx` が残ることを確かめた。

### 4. `RequestModel` の継承漏れ（🔵 提案）→ 対応済み

`app.schemas` の全モデルを走査し、`ValidationMessages` を添えた項目を持つのに `RequestModel` を継承していないモデルが無いことを確かめるテスト（`test_schemas_with_messages_inherit_request_model`）を追加した。現時点で 22 モデルが対象。

### 5. 別名表の作り直し（🔵 提案）→ 対応済み

`_field_messages_by_loc` を `functools.cache` で包み、モデルごとに一度だけ作るようにした。

### 6. 上限値のリテラル（🔵 提案）→ 対応済み

文字数・範囲の文言を、制約と同じ定数から f-string で組み立てるようにした（アシスタント・カテゴリ・ライブラリ・タグ・ライブラリ一覧の件数）。文言は移植元と同じ文字列のままで、スキーマごとのテストが文字列で確かめている。

### 7. ルーターに文言を書いている（🔵 提案）→ 対応済み

ライブラリ一覧のページ番号・件数の型（制約と文言）を `schemas/library.py` に `LibraryPageNumber`・`LibraryPageSize` として定義し、ルーターはその型を使うだけにした。クエリのモデル（`Annotated[Model, Query()]`）への置き換えは、他の検索条件も含めたルーターの作り替えになるため行っていない。

### 8. ページ番号の制約と文言の重複（🔵 提案）→ 対応しない

移植元でも `LibraryListPageRequest` と `TokenUsageListRequest` にそれぞれ書かれている制約で、件数の文言は「ページサイズ」「件数」と違う。片方の移植元の文言が変わったときに、もう片方も変わるとは限らないため、移植元の Request ごとに書く形のままにした。

### 9. 規約の例の食い違い（🔵 提案）→ 対応済み

`backend/.claude/CLAUDE.md` の Good の例を `RequestModel` を継承し、`ValidationMessages` で欠落・null の文言を添えたうえで空白のみを独自チェックで弾く形に直し、空白のみの独自チェックの例であることを明記した。

### 10. 成功時のオーバーヘッド（🔵 提案）→ 対応しない

例外ハンドラ側で置き換える方式は、エラーの位置（`body.name` など）からどのモデルの項目かを特定できず、同じ名前で文言が違う項目を区別できない（02 の方式 B を採らなかった理由）。対象のリクエストは項目数・要素数が小さく（チャットの履歴も数十件程度）、wrap 関数の呼び出しは LLM 呼び出しや DB アクセスに比べて無視できるため、現在の方式のままとした。
