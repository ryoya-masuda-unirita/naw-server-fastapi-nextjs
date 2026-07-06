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

### 2. 既存コードのクリーンアップ（済）

```
#34 issue-34 既存コードにRuffのフォーマット・自動修正を適用
    - pyproject.tomlにtests/unit/conftest.py向けのE402除外設定を追加
    - ruff format . を全体に適用
    - ruff check --fix . で未使用importを解消
```

### 3. 設計変更（pre-pushフック方式の破綻を受けた再設計）

```
#34 issue-34 00〜07のドキュメントをpre-commitフレームワーク方式に書き直す
    - pre-pushフックはamend後の内容が実際にはpushされない致命的な欠陥があると実機で判明したため
    - コミット時にRuffを自動適用するpre-commitフレームワーク方式に設計変更
```

### 4. 旧実装の撤去・新実装

```
#34 issue-34 pre-pushフックを撤去しpre-commitフレームワークに置き換える
    - .githooks/pre-pushを削除
    - .pre-commit-config.yamlを新規作成（ruff-format・ruff --fix、backend/限定）
    - backend/pyproject.tomlのdev依存にpre-commitを追加
    - backend/.claude/CLAUDE.mdのフック初期設定手順をpre-commit向けに書き換え
```

### 5. 動作確認・code-review反映（動作確認・レビュー完了後）

```
#34 issue-34 08_動作確認.md を作成
```

```
#34 issue-34 code-review指摘を修正
```

（内容は指摘に応じて調整する）

## 備考

- 実装中に発見した追加修正が発生した場合はコミットを分けて記録する
- 動作確認では`git log`だけでなく`git ls-remote`でリモートの実態を必ず確認する（旧方式で見落とした反省を踏まえる）
