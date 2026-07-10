# code-review 結果

`/code-review`（medium effort、8角度のサブエージェントによる並行レビュー→検証）を実施。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/index_service.py` | 他テナントの`feedbackId`を指定すると、テナントをまたいで`MessageFeedback`に紐付いてしまう（`files.feedback_id`が単一列FKでテナント条件を含まないため） | 対応済み |
| 2 | 🔴 致命的 | `backend/app/services/index_service.py` | 存在しない`feedbackId`・`roomId`を指定すると、DBのFK制約違反で未処理の`IntegrityError`が発生し500になる（400/404を返すべき） | 対応済み |
| 3 | 🟡 注意 | `backend/app/services/index_service.py` / `backend/app/repositories/*.py` | ファイル作成（`FileRepository.create`内でcommit）と`MessageFeedback`更新（`MessageFeedbackRepository.save`内でcommit）が別々にcommitされ、移植元Javaの単一トランザクション（`@Transactional`）より原子性が弱い | 対応しない |
| 4 | 🟡 注意 | `backend/app/repositories/message_feedback_repository.py` | 新規`find_by_id_and_tenant_id`が既存`find_by_ids_and_tenant_id`と処理が重複している | 対応しない |
| 5 | 🟡 注意 | `backend/app/services/index_service.py` | インデックス404チェックのインラインロジックが`file_service.py`・`index_service.py`内の既存箇所（計4箇所以上）と重複している | 対応しない |
| 6 | 🔵 提案 | `backend/app/core/file_creation.py` | `core/`層に`File`・`Index`等のドメインモデルやリポジトリを持ち込み、ストレージ保存＋DB作成という副作用のある処理を置いている（`core/`の本来の役割＝設定・DI・共通ユーティリティからは逸脱） | 対応しない（判断根拠を記載） |
| 7 | 🔵 提案 | `backend/app/services/index_service.py` | `sync_index()`が「常に400を投げるだけ」の割に、独立したstaticmethod＋docstringが大仰 | 対応しない |
| 8 | 🔵 提案 | `backend/tests/integration/test_indexes.py` | `local_index`フィクスチャが既存の`saas_index`系フィクスチャとほぼ重複（`type`のみ異なる） | 対応しない |

## 詳細

### 1. 他テナントのfeedbackIdによるテナント跨ぎの紐付け（🔴 致命的）→ 対応済み

`backend/app/models/file.py`の`File.feedback_id`は`sa.ForeignKey("message_feedbacks.id", ondelete="CASCADE")`という単一列FKで、`tenant_id`を条件に含まない。修正前の実装は、ファイル作成後に`MessageFeedbackRepository.find_by_id_and_tenant_id`（テナントスコープ）で該当フィードバックを探し、見つかった場合のみ`index_id`を更新していた。そのため、他テナントの`feedbackId`を指定された場合：

- FK制約自体（`message_feedbacks.id`が存在するかのみ）は満たされるため、ファイル作成（`files`テーブルへのINSERT）は成功してしまう
- その後のテナントスコープ検索は該当なし（`None`）となり、`MessageFeedback`更新は静かにスキップされる
- 結果、あるテナントの`File`レコードが、別テナントの`MessageFeedback`を指し示す`feedback_id`を持ったまま残る（RLSによるテナント分離という本プロジェクトの中核方針に反する）

**対応**: `backend/app/services/index_service.py`の`additional_learning`を修正し、`feedback_id`・`room_id`の存在確認を**ファイル作成前**に、必ずテナントIDを条件に含めて行うよう変更した（`MessageFeedbackRepository.find_by_id_and_tenant_id`・`RoomRepository.find_by_id_and_tenant_id`を使用）。見つからない場合は404を返し、ファイル作成自体を行わない。取得済みの`MessageFeedback`を後段の更新でそのまま再利用するよう変更したため、指摘2の修正と合わせて冗長な再取得（2回目のSELECT）も解消した。

回帰テストとして`test_other_tenant_feedback_id_raises_404`（他テナントのフィードバックを指定すると404になり、`File`が作成されず`MessageFeedback.index_id`も更新されないことを確認）を追加した。

### 2. 存在しないfeedbackId/roomIdで未処理のIntegrityErrorが発生する（🔴 致命的）→ 対応済み

同じく`files.feedback_id`・`files.room_id`（`room_id`は`tenant_id`との複合FK）のFK制約により、存在しない`feedbackId`・`roomId`を指定してファイル作成を行うと、`FileRepository.create`内の`INSERT`がFK制約違反で失敗し、`sqlalchemy.exc.IntegrityError`が未処理のままAPI層まで伝播して500エラーになっていた（他のAPIエンドポイントが不正なIDに対して400/404を返す規約と不整合）。

**対応**: 指摘1と同じ修正（ファイル作成前のテナントスコープ存在確認）により、存在しない`feedbackId`・`roomId`は404で明示的に弾かれるようになり、DBレベルのFK違反に到達しなくなった。

回帰テストとして`test_nonexistent_feedback_id_raises_404`・`test_nonexistent_room_id_raises_404`を追加した。

### 3. ファイル作成とMessageFeedback更新のcommitが分離している（🟡 注意）→ 対応しない

移植元Javaは`FileService.additionalLearning`・`createFile`双方が`@Transactional`（デフォルトpropagation）で、ファイルINSERTと`MessageFeedback.indexId`更新は1つの物理トランザクションになる。FastAPI版では`FileRepository.create`・`MessageFeedbackRepository.save`がそれぞれ内部で`session.commit()`を呼ぶため、2回のcommitに分かれている。理論上、`MessageFeedback`更新のcommitが失敗した場合、ファイル作成のcommitは既に確定済みのため、`index_id`が更新されないまま`File`だけが残る部分失敗が起こり得る。

これは是正すべき懸念ではあるが、`FileRepository.create`・`MessageFeedbackRepository.save`はこのIssue以前から本リポジトリ全体で「呼び出し側で`session.commit()`を意識しない」前提で使われている既存の設計であり（`backend/app/services/file_service.py`の他のフローも同様の分割commitを行っている）、これを本Issueの範囲で「呼び出し元でcommitをまとめる」設計に変更するには、両リポジトリを利用する既存の全呼び出し元（ファイルアップロード・更新・削除等）の影響範囲を洗い出す必要があり、Issue #92のスコープ（インデックス同期・追加学習APIの移植）を超える。将来的なリポジトリ層のcommit責務の見直しとして別Issueで扱うべき事項とし、本Issueでは対応しない。

### 4. find_by_id_and_tenant_idがfind_by_ids_and_tenant_idと重複している（🟡 注意）→ 対応しない

`MessageFeedbackRepository.find_by_ids_and_tenant_id([feedback_id], tenant_id, session)`の結果から先頭要素を取り出せば同等の結果が得られるため、単体取得用の`find_by_id_and_tenant_id`は実装上は重複と言える。一方、本リポジトリの他ファイル（例: `file_repository.py`・`room_repository.py`）でも「単体取得用メソッド」と「複数ID一括取得用メソッド」を別々に定義するのが既存の一貫したパターンであり、単体取得の呼び出し側で「リストを作って結果の先頭を取る」という迂遠なコードを書かせるよりも、単体取得専用メソッドを素直に用意する方が可読性の観点で優れると判断し、既存パターンに合わせて対応しないこととする。

### 5. インデックス404チェックの重複（🟡 注意）→ 対応しない

`IndexRepository.find_by_id_and_tenant_id`の結果が`None`の場合に404を返すインラインロジックは、`index_service.py`内の`get_index`・`update_index`・`delete_index`、および`file_service.py`の`_get_index_or_404`と合わせて既に複数箇所に存在しており、本Issueの`additional_learning`はその5箇所目にあたる。共通ヘルパーへの抽出は望ましい改善だが、本Issue以前から存在する重複（4箇所）に対する一括リファクタは本Issueのスコープ外であり、本Issueの追加分のみを個別に共通化すると却って一貫性を欠く（一部だけ共通化・残りはインラインという中途半端な状態になる）。既存コードとの整合性を優先し、本Issueでは対応しない。将来的に`index_service.py`全体をリファクタする際にまとめて対応することを推奨する。

### 6. core/file_creation.pyの責務（🔵 提案）→ 対応しない（判断根拠を記載）

`backend/.claude/CLAUDE.md`は`core/`を「設定・DI・共通ユーティリティ」と定義しており、`file_creation.py`がドメインモデル（`File`・`Index`・`User`）やリポジトリ（`FileRepository`）を持ち込み、ストレージアップロード＋DB作成＋失敗時ロールバックという副作用を伴う処理を行っている点は、字面上は`core/`の定義から逸脱していると言える。

一方で、本リポジトリには`xxx_service.py`が別の`yyy_service.py`を呼ぶことを禁止する規約があり、かつ既存の`core/credit_quota.py`が全く同じ理由（`credit_usage_service.py`・`file_service.py`の双方から使う共通ロジックをサービス間呼び出しを避けて共有するため）で同様に`core/`へ切り出されている前例がある（`credit_quota.py`のdocstラング内で明記済み）。本Issueの`file_creation.py`はこの既存の設計判断を踏襲したものであり、Issue #92単体で新たな第3のレイヤー（例: `domain_services/`）を新設する判断は影響範囲が大きく、本Issueのスコープを超えると判断した。対応しない。

### 7. sync_index()の実装粒度（🔵 提案）→ 対応しない

`IndexService.sync_index()`は常に固定の400エラーを返すだけであり、ルーター側に直接`raise HTTPException(...)`を書く方が短いという指摘は妥当である。一方、本リポジトリの規約（router:service 1対1）では、ルーターがビジネスロジック（エラーメッセージや状態判定を含む）を直接持たずサービス層に委譲することを一貫させており、他の全エンドポイントも同様のパターンで実装されている。将来`sync_index`に実際の同期処理が実装された際の置き換えやすさも考慮し、既存パターンとの一貫性を優先して対応しない。

### 8. local_indexフィクスチャの重複（🔵 提案）→ 対応しない

`local_index`フィクスチャは既存の`saas_index`と`type`のみが異なる。本ファイル（`test_indexes.py`）は既存の`TestCreate`テストでも同様に「LOCALタイプのインデックスをPOSTで都度作成する」テストが個別に書かれており、テスト用フィクスチャを`type`パラメータ化する統一的なリファクタは本Issueのテスト追加のみを目的とした変更のスコープを超えるため、既存の書き方に合わせて対応しない。
