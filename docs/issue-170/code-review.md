# code-review 結果

対象: PR #205（`/code-review 205` を実行）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/prompt_template_service.py` | 向きに前後の空白・誤記があると黙って昇順になる | 一部対応（空白は除去） |
| 2 | 🟡 注意 | `backend/app/services/prompt_template_service.py` | `sort=`（空文字）だと既定の降順ではなく昇順になる | 対応済み |
| 3 | 🔵 提案 | `backend/app/services/prompt_template_service.py` | 向きの `.lower()` がこの API だけで、他の一覧 API と大文字・小文字の扱いが違う | 対応しない |
| 4 | 🔵 提案 | `backend/app/services/prompt_template_service.py` | `sort` の分解処理が各サービスにコピーされている。共通ヘルパーにすべき | 対応しない |
| 5 | 🔵 提案 | `backend/app/routers/prompt_templates.py` | Spring Data の複数 `sort` 指定に対応していない | 対応しない |
| 6 | 🟡 注意 | `backend/app/repositories/prompt_template_repository.py` | テンプレート追加モーダルが送る `addedAt` は黙って更新日時順になる。設計書の記述と合わない | 対応済み（設計書を修正） |
| 7 | 🔵 提案 | `backend/app/repositories/prompt_template_repository.py` | 一般ユーザー向け一覧にも ID の第2キーを付けるべき | 対応しない |
| 8 | 🔵 提案 | `backend/tests/integration/test_prompt_templates.py` | SQLite と PostgreSQL で名前順の照合順序が違う点を検証できていない | 対応しない |
| 9 | 🔵 提案 | `docs/issue-170/05_テスト詳細設計.md` | テストクラス名が設計書と実装で違う | 対応済み |
| 10 | 🔵 提案 | `docs/issue-170/06_タスクリスト.md` | PR 作成済みなのに未チェック。`code-review.md` が無い | 対応済み |

🔴 致命的: 0 件

## 詳細

### 1. 向きの前後の空白・誤記（🟡 注意）→ 一部対応

項目と向きの前後の空白を `strip()` で除くようにした（`sort=name, desc` が降順になる）。テスト `test_sort_ignores_surrounding_spaces` を追加した。
`descending` のような誤記はエラーにせず昇順のままにする。画面（上流 client）は `asc` / `desc` しか送らず、既存の他の一覧 API（グループ・アシスタント等）も同じ扱いのため。

### 2. `sort=` の空文字（🟡 注意）→ 対応済み

FastAPI は `sort=` を既定値ではなく空文字で受け取る。router で `sort.strip() or DEFAULT_ADMIN_SORT` として既定の `updatedAt,desc` に戻すようにした（既存の `size or DEFAULT_PAGE_SIZE` と同じ扱い）。テスト `test_empty_sort_falls_back_to_default` を追加した。

### 3. 大文字・小文字の扱いが他の API と違う（🔵 提案）→ 対応しない

この API は移植元（Spring Data は向きの大文字・小文字を区別しない）に合わせた。他の一覧 API の挙動を変えるのは本 Issue のスコープ外のため手を入れない。

### 4. `sort` の分解処理の共通化（🔵 提案）→ 対応しない

共通化するとグループ・アシスタント・ファイル・ユーザー・インデックスの各一覧 API に変更が及び、本 Issue（テンプレート一覧の並べ替え）のスコープを超える。別 Issue で扱うのが妥当。

### 5. 複数の `sort` 指定（🔵 提案）→ 対応しない

上流 client は `sort` を1つしか送らない。既存の他の一覧 API も1つだけ受ける作りで、揃えている。

### 6. `addedAt` の扱い（🟡 注意）→ 対応済み（設計書を修正）

テンプレート追加モーダル（上流 client の `group-templates-api.service.ts`）は既定で `sort=addedAt,desc` を同じ API に送る。テンプレート自体には追加日時の項目がない。移植元の Spring Data だと存在しないプロパティとして例外になる。移植先は対応外の項目を更新日時順に倒すので、既定（`addedAt,desc`）は従来どおり更新日時の降順で、退行はない。モーダルが出なくならないよう、この挙動は変えない。
`02_基本設計.md` の影響範囲に、`addedAt` は更新日時順になることを正しく書き直した。

### 7. 一般ユーザー向け一覧の第2キー（🔵 提案）→ 対応しない

一般ユーザー向け一覧（チャット画面のテンプレート選択）は本 Issue の対象外で、`01_要件定義.md` でもスコープ外にしている。要件6は管理者向け一覧の並べ替えに対するもの。

### 8. 照合順序の違い（🔵 提案）→ 対応しない

テストはインメモリ SQLite で動かす方針（共有の PostgreSQL は使わない）のため、PostgreSQL の照合順序は検証できない。移植元も DB の照合順序に従って並べるので、PostgreSQL 上の挙動は移植元と同じになる。`08_動作確認.md` の未確認事項に記載済み。

### 9. テストクラス名の食い違い（🔵 提案）→ 対応済み

`05_テスト詳細設計.md` を、並べ替え専用クラス `TestGetAdminPromptTemplatesSort` を新設する記述に直した。

### 10. タスクリストと code-review.md（🔵 提案）→ 対応済み

`06_タスクリスト.md` の PR 作成・code-review の項目をチェックし、本ファイルを作成した。
