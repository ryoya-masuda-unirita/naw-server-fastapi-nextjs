# code-review 結果

対象: PR #203（`/code-review 203`）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/schemas/library.py` | 一覧のタグ絞り込みはハイフン付き・なし両形式を受けるが、ライブラリ更新APIの `tags` は生文字列比較のためハイフン付き形式を受けず、APIごとに受け付ける形式が異なる | 対応しない |
| 2 | 🔵 提案 | `backend/app/repositories/library_repository.py` | 呼び出し箇所ごとの `.hex` 変換ではなく、`String(32)` のID列向けに共通の TypeDecorator 等で型レベルに解決すべき | 対応しない |
| 3 | 🔵 提案 | `backend/tests/integration/test_libraries.py` | 追加したAPI結合テストはSQLite上では修正前でも成功するため、本バグの回帰検知にならない | 対応しない（役割分担を明記） |
| 4 | 🟡 注意 | `backend/tests/unit/test_library_repository.py` | Repositoryテストを `unit/` に置きモックセッションで検証しており、`backend/.claude/CLAUDE.md` の「Model/Repository テストは `integration/` で実DB接続」に反する | 対応済み |
| 5 | 🟡 注意 | `backend/tests/unit/test_library_repository.py` | `session.execute` の呼び出し回数（2回）や自動生成のバインド名接頭辞 `library_tag_id_` に依存しており、実装の内部変更で誤って失敗する | 対応済み |
| 6 | 🔵 提案 | `backend/tests/unit/test_library_repository.py` | `asyncio_mode = "auto"` のため `@pytest.mark.asyncio` は冗長 | 対応済み |

🔴 致命的: 0件

## 詳細

### 1. 更新APIとのタグID形式の差（🟡 注意）→ 対応しない

更新APIの `tags` が生文字列で比較されるのは本PR以前からの既存の挙動で、本PRでは変更していない。画面はタグ一覧APIが返すハイフンなし形式をそのまま送るため、現状の利用で不具合は起きていない。移植元（`LibraryService.replaceTags` は `UUID::fromString` で正規化）との差ではあるが、本Issue（一覧のタグ絞り込みの500エラー）のスコープ外のため、ここでは対応しない。必要であれば別Issueで扱う。

### 2. 型レベルでの共通化（🔵 提案）→ 対応しない

`app/routers/` で `uuid.UUID` 型のパラメータを受けて `String(32)` 列と比較している箇所は、現状この `tagIds` だけであることを確認した。共通 TypeDecorator の導入は全ID列に影響する横断的な設計変更で、バグ修正の範囲を超える。変換の理由はコードコメントに残し、Repositoryテストで回帰を検知できるようにした。

### 3. API結合テストの回帰検知力（🔵 提案）→ 対応しない

指摘どおり、SQLite上のAPI結合テストではこの型不一致を再現できない（`02_基本設計.md`・`03_詳細設計.md` に記載済み）。回帰検知は `tests/integration/test_library_repository.py`（asyncpg方言でのバインド型・値の検証）が担い、API結合テストはハイフン付き形式の吸収・他タグの除外・不正値の拒否という外部仕様の確認を担う、という役割分担にしている。修正を戻すと Repository テストが2件とも失敗することを確認した（`08_動作確認.md` 参照）。

### 4. Repositoryテストの配置（🟡 注意）→ 対応済み

`tests/unit/test_library_repository.py` を削除し、`tests/integration/test_library_repository.py` を新規作成した。モックセッションをやめ、`session` フィクスチャ（インメモリSQLite）で `find_page` を実際に実行し、`do_orm_execute` イベントで発行された文を捕捉して検証する形にした。

### 5. 内部実装への依存（🟡 注意）→ 対応済み

- 実行回数の検証（`len(statements) == 2`）をやめ、捕捉したすべての文から該当するバインドを集めて検証する形にした
- バインドは名前の接頭辞ではなく式木をたどり、「`library_tag_mappings.library_tag_id` を左辺に持つ `IN` 比較の右辺」として特定する。ORM属性経由の列はアノテーション付きのコピーなので、`compare()` で比較する
- asyncpg方言でのパラメータ値は、`compiled.bind_names[bind]` でコンパイル時に決まった名前を引いて取得する

### 6. 冗長な asyncio マーカー（🔵 提案）→ 対応済み

#4 の書き直しで `@pytest.mark.asyncio` を付けない形にした。
