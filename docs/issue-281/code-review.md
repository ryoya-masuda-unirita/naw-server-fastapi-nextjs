# code-review 結果

対象: PR #302（`/code-review medium 302`）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/assistant_category_service.py` | 更新で `description` を省略すると None で上書きされる。移植元は空白でない値だけを反映する | 対応しない（後続に申し送り） |
| 2 | 🟡 注意 | `backend/app/services/assistant_category_service.py` | 更新時の重複名チェック（400）が移植元の service に無い | 対応しない（後続に申し送り） |
| 3 | 🔵 提案 | `backend/tests/integration/test_assistant_categories.py` | 他テナントの 404 のテストで文言を確かめていない | 対応済み |
| 4 | 🔵 提案 | `backend/app/services/assistant_category_service.py` | 更新の 1 か所のために共通ヘルパーへ文言の引数を足すより、呼び出し側で投げる方が簡潔 | 対応しない |
| 5 | 🔵 提案 | `docs/issue-281/06_タスクリスト.md` | `code-review.md` が無い | 対応済み（このファイル） |

## 詳細

### 1. 更新で説明が消える（🟡 注意）→ 対応しない

移植元 `AssistantCategoryService#updateAssistantCategory` は `StringUtils.isNotBlank` の項目だけを上書きする。backend は省略時に `None` で上書きしており、移植元との差分は確かにある。ただしこの PR より前からある挙動で、このチケット（`/options` の確認と 404 の文言）の範囲外のため、ここでは変えない。後続の Issue で扱うよう申し送る。

### 2. 更新時の重複名チェック（🟡 注意）→ 対応しない

backend は同一テナント内の同名カテゴリを 400 で弾く。移植元は service に事前チェックが無く、DB の一意制約の違反になる。1 と同じく既存の差分で範囲外のため、申し送りとする。

### 3. 他テナントの 404 の文言（🔵 提案）→ 対応済み

単体取得・更新の他テナントのテストにも文言の検証を足した。存在しない場合と同じ文言になり、他テナントに存在するかどうかを区別できないことを固定する。

### 4. ヘルパーの引数（🔵 提案）→ 対応しない

単体取得・更新・削除の 3 か所が同じヘルパーで探して 404 を投げており、違うのは文言だけ。呼び出し側で投げ直すと探して投げる処理が更新だけ別の書き方になるため、文言をキーワード引数で渡す形を残す。

### 5. code-review.md（🔵 提案）→ 対応済み

このファイルを追加した。
