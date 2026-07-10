# 07_gitコミット

全自動モードで進めるため、実装完了後にまとめてコミットする。

## 想定コミット構成

1. `#87 issue-87 00〜05_設計ドキュメントを作成`
2. `#87 issue-87 インデックスファイル管理API(管理者向け)を実装`
    - `File`モデル・マイグレーション追加
    - ファイルストレージ抽象化（`LocalFileStorage`）追加
    - クレジット上限チェック共通化（`app/core/credit_quota.py`）
    - `FileRepository`・`FileService`・`files`ルーター追加
    - `UserRepository.find_by_ids`追加
    - 統合テスト追加
3. （必要であれば）code-review指摘の修正コミット

コミットメッセージ規約はプロジェクトルート`.claude/CLAUDE.md`に従う（Conventional Commitsプレフィックス不使用、`Co-Authored-By`不要）。
