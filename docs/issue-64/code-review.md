# code-review 結果

`/code-review`（medium effort）を実行。8観点（line-by-line / removed-behavior / cross-file tracer / reuse / simplification / efficiency / altitude / conventions）でレビューエージェントを並行起動し、完了した angle A（line-by-line scan）から2件の🔴致命的指摘を検出した。他の角度のエージェントは実行環境の制約により完了通知が得られなかったため、実装者自身による直接レビュー（cross-file整合性・reuse・simplification・efficiency・altitude・CLAUDE.md準拠）で補完した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/schemas/token_usage.py` | `page`/`size`クエリパラメータに範囲制約(`ge=`/`le=`)がなく、`size=0`だと`hasNext`が常に`True`になり無限ページング、`page=-1`だとDBに負のOFFSETが渡り500になる | 対応済み |
| 2 | 🔴 致命的 | `backend/app/schemas/token_usage.py` | `from`/`to`の一方のみtz情報なし(naive)で指定すると、`_validate_period`でのnaive/aware混在比較により`TypeError`が送出され422ではなく500になる | 対応済み |
| 3 | 🔵 提案 | `backend/app/schemas/token_usage.py` / `backend/app/services/token_usage_service.py` | `totalCredits = inputCredits+outputCredits+embeddingCredits`の計算式が`TokenUsageItemResponse.from_token_usage`と`TokenUsageService.get_summary`の2箇所に重複している | 対応しない |

## 詳細

### 1. page/size のバリデーション欠如（🔴 致命的）→ 対応済み

`TokenUsageListQuery`の`page: int = 0`・`size: int = 10`に範囲制約がなかったため、以下の不具合があった。

- `size=0`を指定すると、`TokenUsageRepository.find_page`が`limit(0)`で常に空配列を返す一方、`TokenUsageService.list_token_usages`の`hasNext = (query.page + 1) * query.size < total_count`は`(page+1)*0=0`となり、`total_count>0`である限り常に`True`を返す。クライアントは実際にはデータを取得できないまま「次のページがある」と誤認し続ける。
- `page=-1`を指定すると`offset(page * size)`が負の値になり、PostgreSQLは`OFFSET must not be negative`エラーを返す。バリデーションで弾かれるべき入力が、ハンドリングされない500として露出してしまう。

既存の類似実装（`app/routers/users.py`の`size: int = Query(20, ge=1, le=100)`）に倣い、`page: int = Field(default=0, ge=0)`・`size: int = Field(default=10, ge=1, le=100)`に修正した。あわせて`test_size_zero_returns_422`・`test_negative_page_returns_422`を追加し、422で弾かれることを確認した。

### 2. naive/aware datetime混在によるTypeError（🔴 致命的）→ 対応済み

`from`/`to`はPydanticの`datetime`型としてISO-8601文字列をパースするが、タイムゾーンオフセットの有無によってnaive/awareが混在しうる（例: `from=2026-07-01T00:00:00`・`to=2026-07-02T00:00:00+09:00`）。この状態で`_validate_period`が`self.from_ > self.to`を評価すると、Python標準の`datetime`比較はnaive/aware混在で`TypeError`を送出する。Pydantic v2の`model_validator`は`ValueError`/`AssertionError`のみを422に変換するため、`TypeError`はハンドリングされず500として露出する。

`TokenUsagePeriodQuery`に`@field_validator("from_", "to")`を追加し、tzinfoがない場合はUTCとして扱う（`value.replace(tzinfo=timezone.utc)`）ように修正した。これにより`from`/`to`は常にaware同士で比較され、`TypeError`が発生しなくなる。`test_naive_and_aware_datetime_mixed_does_not_raise_500`を追加し、500ではなく正常に処理されることを確認した。

### 3. totalCreditsの計算式重複（🔵 提案）→ 対応しない

`inputCredits+outputCredits+embeddingCredits`という3項の単純な合計計算が、一覧アイテムの変換(`TokenUsageItemResponse.from_token_usage`、Pythonオブジェクトからの計算)とサマリ集計(`TokenUsageService.get_summary`、DB集計結果Rowからの計算)の2箇所に現れる。ただし、片方はORMエンティティ、もう片方はSQL集計結果の`Row`と入力の型が異なり、共通化すると型の違いを吸収する層が別途必要になり、単純な3項加算1行に対してはオーバーエンジニアリングになる。現状は変更コストが低く可読性も損なわないため、今回は対応しない。将来的にクレジット計算ロジックが複雑化する場合は共通関数への切り出しを検討する。

## 補足（cross-file整合性・reuse・efficiency・altitude・conventions）

- `app/routers/token_usage.py` → `app/services/token_usage_service.py` → `app/repositories/token_usage_repository.py`の呼び出し引数の順序・型は全て一致していることを確認した。
- `UserRepository.find_by_id_and_tenant_id(user_id, tenant_id, session)`のシグネチャと`TokenUsageService._ensure_user_exists_if_specified`での呼び出しは一致している。
- ページング一覧取得の「count クエリ + select クエリ」の2クエリ構成は、既存の`UserService.get_users`と同様のパターンであり、N+1問題には該当しない。
- `total_tokens`をDB生成列(`sa.Computed`)として再現する実装は、SQLModelのフィールドに`default=`を指定しないことで実現している。他のサーバー側生成カラム（`created_at`等）と同じパターンであり、モデル内にその理由をコメントで明記済み。
- CLAUDE.md（`backend/.claude/CLAUDE.md`）の「routerとserviceは1対1」「serviceが別serviceを呼ぶ構造は禁止」「型ヒント必須・`Optional`不使用」「バリデーションはschemas/に書く」といった規約について、明確な違反は見つからなかった。
