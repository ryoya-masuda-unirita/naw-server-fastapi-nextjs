# code-review 結果

`/code-review`（medium effort、8角度の並列調査 + 1票検証）を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/core/file_storage.py` | `LocalFileStorage.upload`がアップロードファイル名をサニタイズせず、ディレクトリトラバーサル（`../`等）でtenant_dir外への任意ファイル書き込みが可能 | 対応済み |
| 2 | 🔴 致命的 | `backend/app/services/file_service.py` | `update_file`のファイル置換パスで`name`未指定時に旧ファイル削除後、空文字`name`で新規レコードが作成され復旧不能になる | 対応済み |
| 3 | 🟡 注意 | `backend/app/routers/files.py` | Content-DispositionヘッダーのASCIIフォールバック部分で、表示名に含まれる`"`がエスケープされずヘッダー構造が壊れうる | 対応済み |
| 4 | 🟡 注意 | `backend/app/schemas/file.py` / `backend/app/services/file_service.py` | `FileUploadForm.__init__`・`FileUpdateForm.__init__`・`FileService._to_response`にdocstringがなく、backend/.claude/CLAUDE.mdの「引数・戻り値・例外がある関数には必ず記載すること」に違反 | 対応済み |
| 5 | 🟡 注意 | `backend/app/services/file_service.py` | `_resolve_user_id_filter`は指定`userId`が該当ユーザーなしの場合と未指定の場合を区別せず、いずれも絞り込みなし（全件）を返す | 対応しない |
| 6 | 🟡 注意 | `backend/app/services/file_service.py` | `update_file`のファイル置換は「削除→作成」を別コミットで行っており非トランザクショナル。作成失敗時に旧ファイルを復旧できない | 対応しない |
| 7 | 🔵 提案 | `backend/app/services/file_service.py` | クレジット上限チェック（429）は本Issueスコープでは実際に消費するクレジットがない状態でのガードになっている | 対応しない（設計判断として文書化済み） |
| 8 | 🔵 提案 | `backend/app/services/file_service.py` | `create_file`/`update_file`（置換時）で`_to_single_response`が`current_user`と同一人物のユーザー名を再クエリしている（軽微な冗長クエリ） | 対応しない |
| 9 | 🔵 提案 | `backend/app/schemas/file.py` | `FileUploadForm`と`FileUpdateForm`がほぼ同一の構造を持つ | 対応しない |

## 詳細

### 1. ディレクトリトラバーサル（🔴 致命的）→ 対応済み

`LocalFileStorage.upload`は`target_path = tenant_dir / f"{file_id}_{filename}"`という形でアップロードされたファイル名をそのままパス結合していた。`filename`はクライアントが自由に指定できる値（multipartの`filename`パラメータ）であり、`../../../../etc/evil.txt`のような値を渡すと、`Path`の`/`演算子がパス区切りとして解釈し、`tenant_dir`（さらにはストレージルート）の外側に任意のファイルを書き込めてしまう。

移植元（Spring Boot）はAzure Blob Storageに保存しておりBlob名にディレクトリトラバーサルの概念がないため顕在化しなかったが、本Issueで新規に導入したローカルファイルシステム実装で新たに生じた脆弱性のため、致命的として即修正した。

`Path(filename).name`でベース名のみを抽出してから保存ファイル名を組み立てるよう修正（`backend/app/core/file_storage.py`）。回帰テストを`backend/tests/unit/test_file_storage.py`の`test_upload_sanitizes_path_traversal_filename`に追加。

### 2. ファイル置換時のname欠落によるデータ消失（🔴 致命的）→ 対応済み

`update_file`のファイル置換パスは、移植元同様「旧ファイルを削除→新規ファイルとして作成」という手順を踏むが、実装時に`form.name or ""`としていたため、`name`が未指定の場合でも例外を投げず、空文字の`name`で新規レコードを作成していた。旧ファイルは既に削除済みのため、この状態からは復旧できない。

移植元（Java）は`dto.getName()`が`null`の場合、DBのNOT NULL制約違反で例外（500）になり少なくとも“大きな音を立てて失敗”するが、Python版は`or ""`によりこれを握りつぶし、静かに不正なデータを作ってしまっていた点で移植元より悪化していた。

旧ファイルを削除する**前**に`form.name`の有無を検証し、空であれば400を返すよう修正（`backend/app/services/file_service.py`の`update_file`）。回帰テストを`test_update_with_file_without_name_returns_400`として追加し、400が返ること・旧ファイルが削除されず残っていることの両方を検証した。

### 3. Content-Dispositionヘッダーのクォートエスケープ不足（🟡 注意）→ 対応済み

ダウンロードAPIのContent-DispositionヘッダーのASCIIフォールバック部分（`filename="..."`）で、表示名に含まれる`"`をエスケープせずそのまま埋め込んでいたため、表示名に`"`を含むファイルをアップロードするとヘッダー構造が崩れる可能性があった。`"`を`'`に置換し、念のため制御文字（`\r`・`\n`）も除去するよう修正した（`backend/app/routers/files.py`）。

### 4. docstring欠落（🟡 注意）→ 対応済み

`backend/.claude/CLAUDE.md`の「Google スタイルで書く。引数・戻り値・例外がある関数には必ず記載すること。」というルールに対し、`FileUploadForm.__init__`・`FileUpdateForm.__init__`・`FileService._to_response`にdocstringがなかった。いずれもArgsセクションを追加した。

### 5. `_resolve_user_id_filter`のNone曖昧性（🟡 注意）→ 対応しない

`userId`クエリで指定した値が既存ユーザーに該当しない場合と、`userId`自体が未指定の場合の両方で`None`を返すため、一覧検索で「存在しないuserIdを指定したら空一覧になる」ことを期待すると、実際には絞り込みなし（全件）が返ってしまう。

これは移植元Java（`FileService.resolveUserIdFilter`・`searchFiles`）にも全く同じ挙動が存在する（`resolvedUserId`が`null`なら`predicates`に条件を追加しない）ため、本Issueで新規に持ち込んだ回帰ではなく、移植元の忠実な移植の結果である。仕様変更を伴う修正はスコープ外と判断し、本PRでは対応しない。将来的にUX改善として対応する場合は別Issueとする。

### 6. ファイル置換の非トランザクショナルな実装（🟡 注意）→ 対応しない

`update_file`のファイル置換パスは、`delete_file`（コミット済み）→`_save_to_storage_and_create`（別コミット）という2段階の別トランザクションで構成されており、後者が失敗すると旧ファイルが失われた状態のまま復旧できない。

これも移植元Java（`FileService.updateFile`が`deleteFile(...)`→`createFile(...)`を素朴に順次呼ぶだけで、Spring `@Transactional`は付いているものの内部でストレージI/Oを含む複数のコミット相当処理を行っており実質的に同じ非原子性を持つ）と同じ設計であり、本Issueのスコープ（5エンドポイントの移植）を超える改善（真のトランザクショナルな置換、Sagaパターン等の導入）が必要になるため、本PRでは対応しない。フォローアップとして別Issue化を検討する。

### 7. クレジット上限チェックのタイミング（🔵 提案）→ 対応しない（設計判断として文書化済み）

本Issue（#87）はコンテンツ抽出・埋め込み（Issue #88スコープ）を含まないため、ファイルアップロード自体はクレジットを消費しない。にもかかわらず`enforce_within_quota`による429ガードをアップロード時に呼んでいる。

これは「同一のクレジット上限チェックを移植元と同じ位置（アップロード開始時）に置く」という`docs/issue-87/01_要件定義.md`に明記した意図的な設計判断であり、Issue #88で実際の埋め込み処理・クレジット記録を追加した際に、このチェックの位置づけを再確認する前提としている。本PRでは対応しない。

### 8. 更新者名の冗長な再クエリ（🔵 提案）→ 対応しない

`create_file`・`update_file`（置換時）は、直後に`_to_single_response`で`file.user_id`から`updatedBy`を解決するために`UserRepository`へ再クエリしているが、この時点の`file.user_id`は`current_user.id`と同一であり、`current_user.name`を直接使えば省略できる。

N+1問題（行数分のクエリ発行）には該当せず、1リクエストあたり高々1回の追加クエリに留まる軽微な最適化余地のため、本PRのスコープでは対応を見送る。

### 9. `FileUploadForm`と`FileUpdateForm`の重複（🔵 提案）→ 対応しない

両クラスは`name`の必須/任意以外ほぼ同一の構造を持つ。`backend/.claude/CLAUDE.md`は主にPydantic `BaseModel`の`@field_validator`共有について基底クラス化を推奨しているが、両クラスはFastAPIの`Form()`依存性注入用のプレーンなクラスでバリデーションロジックを持たないため、共通化の実益は小さいと判断し、本PRでは対応を見送る。
