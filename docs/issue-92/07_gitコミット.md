# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs/issue-92一式を作成 | `docs/issue-92/*` |
| 2 | インデックス同期・追加学習APIを移植 | `backend/app/core/file_creation.py`（新規）、`backend/app/services/file_service.py`、`backend/app/services/index_service.py`、`backend/app/repositories/message_feedback_repository.py`、`backend/app/schemas/index.py`、`backend/app/routers/indexes.py`、`backend/tests/integration/test_indexes.py` |

## 各コミットメッセージ案

```
#92 issue-92 docs/issue-92一式を作成
    - 要件定義・基本設計・詳細設計・テスト設計・タスクリストを作成
```

```
#92 issue-92 インデックス同期・追加学習APIを移植
    - POST /api/admin/indexes/{id}/sync を追加（移植元同様、常に400を返すスタブ）
    - POST /api/admin/indexes/{id}/additionalLearning を追加
    - FileService.create_fileと共通するストレージ保存・File作成ロジックをcore/file_creation.pyへ抽出し、
      サービス間呼び出し禁止規約に反しないよう IndexService・FileService の双方から再利用するようリファクタ
    - MessageFeedbackRepository.find_by_id_and_tenant_idを追加
    - IndexAdditionalLearningForm（multipart/form-data用フォームスキーマ）を追加
    - 回帰テスト・新規テスト（TestSync・TestAdditionalLearning）を追加
```
