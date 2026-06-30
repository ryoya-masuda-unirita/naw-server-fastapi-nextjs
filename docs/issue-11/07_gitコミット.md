# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | `01_要件定義.md`〜`05_テスト詳細設計.md` を作成 | `docs/issue-11/01_要件定義.md`〜`05_テスト詳細設計.md` |
| 2 | ユーザー・テナント取得処理をリポジトリ層に集約 | `backend/app/repositories/user_repository.py`（新規）、`backend/app/repositories/tenant_repository.py`（新規）、`backend/app/core/security.py`、`backend/app/services/user_service.py`、`backend/app/services/auth_service.py` |
| 3 | パスワード照合処理を非同期化しブロッキングを解消 | `backend/app/core/security.py`、`backend/app/core/password_policy.py`、`backend/app/services/auth_service.py` |
| 4 | ユーザー一覧検索のLIKEワイルドカードエスケープとソート列許可リストを追加 | `backend/app/services/user_service.py` |
| 5 | ユーザー作成・更新のパスワード発行処理を共通化 | `backend/app/services/user_service.py` |
| 6 | `UserResponse.from_user` に型ヒントを付与 | `backend/app/schemas/user.py` |
| 7 | リファクタに対応する単体・結合テストを追加 | `backend/tests/unit/test_user_service.py`、`backend/tests/unit/test_auth_service.py`、`backend/tests/unit/test_security.py`、`backend/tests/integration/test_user_repository.py`（新規）、`backend/tests/integration/test_tenant_repository.py`（新規）、`backend/tests/integration/test_users.py` |
| 8 | `06_タスクリスト.md` のチェック更新・`08_動作確認.md` を作成 | `docs/issue-11/06_タスクリスト.md`、`docs/issue-11/08_動作確認.md`（新規） |
| 9 | `/code-review` の指摘を `code-review.md` に記録（指摘があれば追加で修正コミット） | `docs/issue-11/code-review.md`（新規） |

## 各コミットメッセージ案

### コミット1

```
#11 issue-11 01_要件定義.md〜05_テスト詳細設計.mdを作成
    - 移植元Spring Boot実装を調査し、認証エラーコード差異・削除冪等設計が意図的な仕様であることを確認
    - フロントエンド参照実装を調査し、sortパラメータが実際にキャメルケースで送信されることを確認
    - リポジトリ層集約・LIKEエスケープ・ソート許可リスト・パスワード発行共通化・非同期化の設計方針を記載
```

### コミット2

```
#11 issue-11 ユーザー・テナント取得処理をリポジトリ層に集約
    - UserRepository.find_by_login_id／TenantRepository.find_by_idを新規作成
    - core/security.py・services/user_service.py・services/auth_service.pyの重複クエリをリポジトリ利用に置き換え
```

### コミット3

```
#11 issue-11 パスワード照合処理を非同期化しブロッキングを解消
    - core/security.pyにverify_password_asyncを追加（asyncio.to_threadでbcrypt検証を別スレッド化）
    - auth_service.py・core/password_policy.pyのパスワード照合をverify_password_async利用に変更
```

### コミット4

```
#11 issue-11 ユーザー一覧検索のLIKEワイルドカードエスケープとソート列許可リストを追加
    - searchTextの%・_・バックスラッシュをエスケープしリテラル検索を保証
    - sortパラメータの列名解決を許可リスト方式に変更し任意の内部属性へのソートを防止
    - 許可リスト外の指定は既定列（作成日時）にフォールバック
```

### コミット5

```
#11 issue-11 ユーザー作成・更新のパスワード発行処理を共通化
    - create_user・update_userに重複していたパスワード生成・有効期限算出・履歴保存処理を_issue_initial_passwordに集約
```

### コミット6

```
#11 issue-11 UserResponse.from_userに型ヒントを付与
```

### コミット7

```
#11 issue-11 リファクタに対応する単体・結合テストを追加
    - tests/unit/test_user_service.pyにLIKEエスケープ・ソート許可リスト・パスワード発行共通化のテストを追加
    - tests/unit/test_auth_service.pyにパスワード履歴0件ログイン失敗・リセット時履歴保存検証を追加
    - tests/unit/test_security.pyにverify_password_asyncのテストを追加
    - tests/integration/test_user_repository.py・test_tenant_repository.pyを新規作成
    - tests/integration/test_users.pyにLIKEエスケープ・キャメルケースソート・許可リスト外フォールバックの結合テストを追加
```

### コミット8

```
#11 issue-11 動作確認を実施し08_動作確認.mdを作成
    - サーバー起動・LIKEエスケープ/ソート許可リスト/既存6エンドポイントの実機動作確認
    - タスクリストを全項目完了にチェック
```

### コミット9（必要な場合）

```
#11 issue-11 code-reviewの指摘を修正
    - （指摘内容に応じて記載）
```
