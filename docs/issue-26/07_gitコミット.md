# 07_gitコミット

## コミット分割案

### 1. ドキュメント作成（済）

```
#26 issue-26 00_チケット内容.md を作成
```

```
#26 issue-26 01_要件定義.md・02_基本設計.md を作成
```

```
#26 issue-26 03_詳細設計.md〜07_gitコミット.md を作成
```

### 2. 実装

```
#26 issue-26 アシスタント一覧取得APIを実装
    - Assistant・GroupAssistantモデルとマイグレーションを追加
    - AssistantRepository・GroupAssistantRepositoryを追加
    - AssistantServiceにGroup紐づけによるフィルタリング・重複排除ロジックを実装
    - GET /api/assistantsエンドポイントを追加しmain.pyに登録
```

### 3. seedデータ

```
#26 issue-26 動作確認用にアシスタント・グループ紐付けをseed.sqlに追加
```

### 4. テスト

```
#26 issue-26 アシスタント一覧取得APIのテストを追加
    - conftest.pyのテーブルクリア対象にassistants・groups_assistantsを追加
    - tests/integration/test_assistants.pyにフィルタリング・重複排除・未所属時の空配列返却のテストを追加
```

### 5. 動作確認・code-review反映（動作確認・レビュー完了後）

```
#26 issue-26 08_動作確認.md を作成
```

```
#26 issue-26 code-review指摘を修正
```

（内容は指摘に応じて調整する）

## 備考

- 実装中に発見した追加修正が発生した場合はコミットを分けて記録する
