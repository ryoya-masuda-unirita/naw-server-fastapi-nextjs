# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `waha-emulator/tests/conftest.py` | `"server-local"` というスラッシュなしの文字列でパスを組み立てていて、置き換えの対象から漏れていた | 対応済み |
| 2 | 🟡 注意 | `.claude/agents/naw-explore.md` ほか（AI 向けドキュメント） | 移植元と移植先がどちらも `server/`・`client/` になり、対応関係が読めなくなる記述があった | 対応済み |
| 3 | 🔵 提案 | `secuaigent-infra/` | `terraform plan` を確認できていない | 対応しない |
| 4 | 🔵 提案 | `.claude/settings.json` | 個人のローカル絶対パスが入った許可ルールが残っている（元からのもの） | 対応しない |

## 詳細

### 1. `waha-emulator/tests/conftest.py` の旧パス（🟡 注意）→ 対応済み

`Path(...)/"server-local"` のように、スラッシュを含まない文字列でディレクトリを指していた。ルール（`server-local/` の形だけを置き換える）では拾えない。`waha-emulator` のテストがコレクション時に落ちて気づき、`"secuaigent-server-local"` に直した。修正後 169 件成功。

同じ形の見落としがないかを、`"backend"`・`"frontend"`・`"infra"`・`"server-local"` の文字列リテラルの検索と、`./`・`../` が前に付く相対パスの検索で確認した。後者では compose の `context`・`build` が漏れていたので直した。残りは Terraform のリソース名・compose のサービス名など、別物だった。

### 2. 移植元と移植先の区別（🟡 注意）→ 対応済み

名前を揃えた結果、「`server/` ⇄ `server/`」のように読める記述ができた。CLAUDE.md・AGENTS.md・`.cursorrules`・`naw-explore`・`naw-frontend-explore` で、移植元は `secuaigent/server/`、移植先は `server/` と書き分けた。表は見出し（`secuaigent-ref/` 配下）に合わせた。

### 3. `terraform plan`（🔵 提案）→ 対応しない

state のバケットが手元の AWS アカウントに見つからず、plan を実行できなかった（バケット名は規則から推測したもの）。変更は名前だけで、state のキー・リソース名は触っていない。`terraform fmt -check` と `validate` は成功している。

### 4. `.claude/settings.json` の絶対パス（🔵 提案）→ 対応しない

`/Users/…/naw-server-fastapi-nextjs/backend/tests/…` を含む許可ルールがあり、置き換えで `server/` に変わった。実際のリポジトリの場所（`Documents/personal/…`）と違う古いパスで、元から効いていない。この Issue の範囲外なので、整理は別途にする。
