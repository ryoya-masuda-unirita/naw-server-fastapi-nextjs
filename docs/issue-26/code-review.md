# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/alembic/versions/004_add_assistants.py` | マイグレーションが`type`列を`String(32)`で作成しており、モデル側の`Enum`定義と食い違う。downgradeもenum型を削除していない | 対応済み |
| 2 | 🔵 提案 | `backend/app/services/assistant_service.py` | レスポンスの`groups`項目が、リクエストユーザーが所属しないグループのIDも含む（テナント内の全所属グループ） | 対応しない（移植元と同一仕様） |
| 3 | 🔵 提案 | `backend/app/routers/assistants.py` | `get_assistants`のdocstringにArgs/Returnsセクションがない | 対応しない（既存の他ルーターと同一スタイル） |

## 詳細

### 1. マイグレーションとモデルのEnum定義の不一致（🟡 注意）→ 対応済み

既存の`users`テーブルのマイグレーション（`001_init_tenants_users.py`）は、`role`列をPostgresの`ENUM`型として明示的に作成し（`sa.Enum("USER","ADMIN","SYSTEM", name="userrole")`）、`downgrade()`で`DROP TYPE IF EXISTS userrole`を実行して型も削除している。

今回追加した`004_add_assistants.py`は、モデル（`app/models/assistant.py`）では`type`列を`sa.Enum(AssistantType, name="assistanttype")`と定義しているにもかかわらず、マイグレーションでは単純な`String(32)`列として作成しており、`downgrade()`もenum型の削除を行っていなかった。実運用では動作していたが（値の入出力自体はVARCHARでも成立するため）、モデルの型定義と実際のDBスキーマが乖離しており、将来的な`alembic check`等での差分検出や、Postgresネイティブenum型を前提にした操作で問題が起きる可能性があった。

`users`テーブルと同じパターンに合わせ、マイグレーションで`sa.Enum("SECURE","SAAS_CHAT","SAAS_RAG", name="assistanttype")`として明示的に作成し、`downgrade()`に`DROP TYPE IF EXISTS assistanttype`を追加した。修正後、`upgrade→downgrade→upgrade`を2往復実行し、enum型の重複エラーが起きずに冪等に動作することを確認した。

### 2. レスポンスの`groups`項目に無関係なグループが含まれる（🔵 提案）→ 対応しない

`GET /api/assistants`のレスポンスに含まれる`groups`項目は、そのアシスタントが紐づく全グループのIDであり、リクエストしたユーザーが所属していないグループのIDも含まれ得る（アシスタントが複数グループに紐づいている場合）。情報露出の観点では気になる点だが、移植元Spring Boot（`AssistantService.toAssistantGetResponse`の`assistant.getGroups()`）も同様に全グループIDを返す仕様であることを確認済みであり、本チケットは移植であるため仕様を変更しない。

### 3. ルーターのdocstring省略（🔵 提案）→ 対応しない

`backend/.claude/CLAUDE.md`のdocstring規約に照らすとArgs/Returnsの記載漏れだが、`auth.py`・`users.py`・`groups.py`など既存の全ルーターファイルが同様に一行docstringのみで統一されているため、このファイルだけ書式を変えると一貫性が崩れる。ルーター全体のdocstring規約見直しは別途まとめて対応する方が適切と判断し、今回は既存スタイルに合わせた。
