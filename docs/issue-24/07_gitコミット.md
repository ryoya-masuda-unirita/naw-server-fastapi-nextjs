# 07_gitコミット

## コミット分割案

### 1. ドキュメント作成（済）

```
#24 issue-24 00_チケット内容.md を作成
```

```
#24 issue-24 01_要件定義.md・02_基本設計.md を作成
```

```
#24 issue-24 03_詳細設計.md〜07_gitコミット.md を作成
```

### 2. モデル・マイグレーション

```
#24 issue-24 グループ管理用のGroup・GroupUserモデルとマイグレーションを追加
    - Group・GroupUserモデルをmodels/group.pyに追加
    - groups・groups_usersテーブルを追加するAlembicマイグレーションを作成
    - UserRepositoryにfind_by_id_and_tenant_idを追加
```

### 3. 実装（repositories/services/routers）

```
#24 issue-24 チーム（グループ）管理APIを実装
    - GroupRepository・GroupUserRepositoryを追加
    - GroupServiceに権限判定・CRUD・所属ユーザー管理ロジックを実装
    - GET /api/groups、/api/admin/groups系エンドポイントを追加
    - main.pyに新規ルーターを登録
```

### 4. seedデータ

```
#24 issue-24 動作確認用に一般ユーザー2名をseed.sqlに追加
```

### 5. テスト

```
#24 issue-24 グループ管理APIのテストを追加
    - conftest.pyのテーブルクリア対象にgroups・groups_usersを追加
    - tests/integration/test_groups.pyに権限モデル・CRUD・所属ユーザー管理のテストを追加
    - tests/unit/test_group_service.pyに権限判定ロジックのテストを追加
```

### 6. 動作確認・code-review反映（動作確認・レビュー完了後）

```
#24 issue-24 08_動作確認.md を作成
```

```
#24 issue-24 code-review指摘を修正
```

（内容は指摘に応じて調整する）

## 備考

- 全自動モードのため、実装・テスト・動作確認・PR作成・code-review・修正までを連続して実施する
- 実装中に発見した追加修正が発生した場合はコミットを分けて記録する
