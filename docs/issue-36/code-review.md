# code-review 結果

`/code-review`（medium effort、8観点の並列レビュー）を実行。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/routers/prompt_templates.py` | 管理者向け作成・更新・削除エンドポイントに権限チェックが一切なく、一般ユーザーでもテンプレートを作成・改変・削除できてしまう | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/prompt_template_service.py` | 作成・更新でテンプレート本体とグループ紐付けを2回に分けてコミットしており、2回目が失敗すると不整合な状態でテンプレートが永続化される | 対応済み |
| 3 | 🟡 注意 | `backend/app/routers/prompt_templates.py` | 更新エンドポイントの404判定をルーターが行っており、レイヤー責務（router=HTTPルーティングのみ、service=ビジネスロジック）に反する | 対応済み |
| 4 | 🟡 注意 | `backend/app/routers/prompt_templates.py` | `excludeGroupId`クエリパラメータがcamelCaseのまま宣言されており、PEP 8および既存の`alias=`パターン（`groups.py`の`isBelonged`）と不整合 | 対応済み |
| 5 | 🟡 注意 | `backend/app/repositories/prompt_template_repository.py` | `_apply_search`の引数・戻り値に型ヒントがなく、CLAUDE.mdの型ヒント必須ルールに反する | 対応済み |
| 6 | 🔵 提案 | `backend/app/repositories/group_prompt_template_repository.py` | `find_template_ids_by_group_ids`がどこからも呼ばれていない未使用コード | 対応済み |
| 7 | 🔵 提案 | `backend/app/repositories/group_prompt_template_repository.py` | `replace_groups_for_template`が既存行をSELECTしてPythonループで1件ずつDELETEしている（一括DELETEにできる） | 対応済み（ユーザー指摘により追加対応） |
| 8 | 🔵 提案 | `backend/app/services/prompt_template_service.py` | `PromptTemplateService._is_tenant_admin`が`GroupService._is_tenant_admin`と同一実装で重複している | 対応しない |
| 9 | 🔵 提案 | `backend/app/repositories/prompt_template_repository.py` | 管理者向け一覧で`team`/`__none__`フィルタ指定時に`admin_group_ids`によるスコープ制限が適用されない（移植元Java `Specification`の挙動に忠実） | 対応しない |

## 詳細

### 1. 管理者向けCRUDエンドポイントの権限チェック欠如（🔴 致命的）→ 対応済み

`POST/PATCH/DELETE /api/admin/prompt-templates`が`Depends(get_current_user)`のみで、ロールチェックを一切行っていなかった。一般ユーザー（`role=USER`）でも任意のテナントのプロンプトテンプレートを作成・改変・削除できてしまう状態だった。

`backend/app/routers/prompt_templates.py`の3エンドポイントを`Depends(require_admin)`に変更し、テナント管理者のみ許可するよう修正（`groups.py`の`create_group`/`delete_group`と同じ方針）。結合テストに`test_non_admin_cannot_create`・`test_non_admin_cannot_update`・`test_non_admin_cannot_delete`を追加し、実際にAPI経由でも403になることを確認した。

### 2. 作成・更新の非アトミックな2回コミット（🟡 注意）→ 対応済み

`PromptTemplateRepository.save()`でテンプレート本体をコミットした後、グループ紐付けの変更を別コミットで行っていたため、2回目のコミットが失敗すると「テンプレートは保存されたがグループ紐付けは古いまま」という不整合な状態になり得た。

`backend/app/services/prompt_template_service.py`の`create_prompt_template`・`update_prompt_template`を、テンプレート本体の`session.add`とグループ紐付けの変更をまとめて1回の`commit`で行うよう修正。これに伴い、他で使われなくなった`PromptTemplateRepository.save`を削除した。

### 3. ルーターでの404判定（🟡 注意）→ 対応済み

`backend/.claude/CLAUDE.md`のレイヤー責務規約（`routers/ → HTTPルーティング・リクエスト受け取り・レスポンス返却`、`services/ → ビジネスロジック`）に反し、`update_prompt_template`ルーターが`if not updated: raise HTTPException(404)`というビジネス判定を行っていた。

`PromptTemplateService.update_prompt_template`がテンプレート不在時に自身で`HTTPException(404)`を送出するよう変更し、ルーターは戻り値をそのまま返すだけにした（`GroupService._get_group_or_404`と同じ方針）。

### 4. `excludeGroupId`のcamelCase直書き（🟡 注意）→ 対応済み

PEP 8（`backend/.claude/CLAUDE.md`「PEP 8 準拠」）に反し、かつ`groups.py`の`is_belonged: bool = Query(False, alias="isBelonged")`という既存パターンとも不整合だった。

`exclude_group_id: str | None = Query(None, alias="excludeGroupId")`に修正。クエリパラメータ名（フロントエンド契約）は変えていない。

### 5. `_apply_search`の型ヒント欠如（🟡 注意）→ 対応済み

`backend/.claude/CLAUDE.md`「型ヒントをすべての関数・メソッドの引数と戻り値に必ず付ける」に反し、`stmt`引数と戻り値に型がなかった。`sqlalchemy.sql.Select`型を追加した。

### 6. 未使用メソッド`find_template_ids_by_group_ids`（🔵 提案）→ 対応済み

`GroupPromptTemplateRepository.find_template_ids_by_group_ids`はどこからも呼ばれておらず、一般ユーザー向け一覧は`PromptTemplateRepository.find_page_by_group_ids`内の`EXISTS`部分問い合わせで同等の判定を行っていた。プロジェクトの「不要コードの削除」規約に従い削除した。

### 7. `replace_groups_for_template`のループDELETE（🔵 提案）→ 対応済み（ユーザー指摘により追加対応）

既存行をSELECTしてPythonループで1件ずつ`session.delete`していた点を、`sqlalchemy.delete(GroupPromptTemplate).where(...)`による一括DELETEに変更した。SELECTも不要になり、1テンプレートあたりのグループ紐付け件数に関わらず1回のDELETE文で完結する。当初のレビューでは実害が小さいとして見送ったが、レビュー結果を確認したユーザーからの指摘を受けて追加対応した。

### 8. `_is_tenant_admin`の重複（🔵 提案）→ 対応しない

`GroupService._is_tenant_admin`と全く同じ実装が`PromptTemplateService`にも存在する。共通化する価値はあるが、`GroupService`（本チケットの対象外ファイル）にまで変更が及ぶため、スコープを超える変更を避けるという既存の運用方針（他チケットで対応済みの箇所や無関係なファイルへの変更を避ける）に従い、本チケットでは対応しない。

### 9. 管理者向け一覧の`team`/`__none__`フィルタによるスコープ回避（🔵 提案）→ 対応しない

グループ管理者が`team`に自分の管理外のグループIDを指定したり`team=__none__`を指定した場合、`admin_group_ids`による絞り込みが適用されず、本来閲覧できないはずのテンプレートが見えてしまう可能性がある。

これは移植元（Java `PromptTemplateSpecification.matchesAdminScope`）の`groupFilter`指定時に無条件で管理者スコープを無視する挙動をそのまま踏襲したものであり、本PRで新たに作り込んだ問題ではない。移植方針（移植元の挙動を忠実に再現する）に従い、本チケットでは変更しない。将来的にセキュリティ上の懸念として対応する場合は別チケットで検討する。
