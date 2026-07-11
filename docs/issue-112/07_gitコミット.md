# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式（00〜08）を作成 | `docs/issue-112/*` |
| 2 | Group一覧APIのassistants/assistantIds/promptTemplates実データ配線を実装 | `app/repositories/group_assistant_repository.py`, `app/repositories/group_prompt_template_repository.py`, `app/schemas/group.py`, `app/services/group_service.py`, `tests/integration/test_groups.py` |

## 各コミットメッセージ案

```
#112 issue-112 ドキュメント一式を作成
    - 00_チケット内容〜08_動作確認を作成
```

```
#112 issue-112 Group一覧APIのassistants/assistantIds/promptTemplates実データ配線
    - GroupAssistantRepository/GroupPromptTemplateRepositoryにグループID一覧からのIN句一括取得メソッドを追加
    - GroupListItemResponseのコメント・デフォルト値を修正し実データを返すように変更
    - GroupService._to_list_itemをマップ受け取り方式に変更しN+1を回避
    - 実データ配線の回帰テストを追加
```
