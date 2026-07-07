# 07_gitコミット

想定コミット単位（実装状況に応じて前後・統合する場合がある）。

1. `03_詳細設計.md`〜`06_タスクリスト.md`を作成
2. マイグレーション（`ai_models`・`assistant_category_mappings`）とモデルを追加
3. リポジトリ層（Assistant/AssistantCategoryMapping/GroupAssistant/AssistantEndpoint/TenantEndpoint/AssistantCategory/AIModel）を追加
4. スキーマ・権限依存関数（`require_admin_or_group_admin`）を追加
5. サービス層（作成・更新・削除・一覧・エンドポイント一覧・AIモデル一覧）を追加し、一般ユーザー向け一覧のカテゴリ実データ化も対応
6. ルーター・`main.py`登録を追加
7. `seed.sql`に動作確認用データを追加
8. テスト（unit/integration）を追加
9. 動作確認結果を記録
10. code-reviewの指摘対応（発生した場合）
