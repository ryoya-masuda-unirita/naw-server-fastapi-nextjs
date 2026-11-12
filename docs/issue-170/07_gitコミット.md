# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-170/00`〜`07` |
| 2 | 管理者向けテンプレート一覧の並べ替え対応とテスト | `backend/app/routers/prompt_templates.py`、`backend/app/services/prompt_template_service.py`、`backend/app/repositories/prompt_template_repository.py`、`backend/tests/...` |
| 3 | 動作確認の記録 | `docs/issue-170/06`・`08` |

## 各コミットメッセージ案

```text
#170 issue-170 テンプレート一覧の並べ替え対応の設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.md を作成
    - frontend-angular は sort を送信済みで、原因はバックエンドのみと判明
```

```text
#170 issue-170 管理者向けテンプレート一覧APIでsortパラメータによる並べ替えに対応
    - GET /api/admin/prompt-templates に sort クエリパラメータ（既定 updatedAt,desc）を追加
    - name / updatedAt の昇順・降順で並べ替え、同値は ID 昇順で順序を確定
    - 結合テスト・サービス単体テストを追加
```

```text
#170 issue-170 動作確認結果を記録
    - 08_動作確認.md に pytest の実行結果を記録
```
