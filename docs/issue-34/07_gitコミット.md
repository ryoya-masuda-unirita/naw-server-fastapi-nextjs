# 07_gitコミット

## コミット分割案

### 1. ドキュメント作成（済）

```
#34 issue-34 00_チケット内容.md を作成
```

```
#34 issue-34 01_要件定義.md・02_基本設計.md を作成
```

```
#34 issue-34 03_詳細設計.md〜07_gitコミット.md を作成
```

### 2. 既存コードのクリーンアップ

```
#34 issue-34 既存コードにRuffのフォーマット・自動修正を適用
    - pyproject.tomlにtests/unit/conftest.py向けのE402除外設定を追加
    - ruff format . を全体に適用
    - ruff check --fix . で未使用importを解消
```

### 3. 実装

```
#34 issue-34 Ruffのpre-pushフックとCIチェックを追加
    - .githooks/pre-pushを新規作成しpush時にruff format・ruff check --fixを自動実行してamendする
    - backend-tests.ymlにlintジョブ（--fixなしの検証のみ）を追加
    - backend/.claude/CLAUDE.mdにフックの初期設定手順を追記
```

### 4. 動作確認・code-review反映（動作確認・レビュー完了後）

```
#34 issue-34 08_動作確認.md を作成
```

```
#34 issue-34 code-review指摘を修正
```

（内容は指摘に応じて調整する）

## 備考

- 実装中に発見した追加修正が発生した場合はコミットを分けて記録する
