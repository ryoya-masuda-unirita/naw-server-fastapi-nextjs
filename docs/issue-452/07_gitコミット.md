# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計書（00〜02） | `docs/issue-452/00`〜`02` |
| 2 | 設計書（03〜07） | `docs/issue-452/03`〜`07` |
| 3 | サービス ID の接尾辞で保存先を切り替える（ひな形の読み込みと解決）、テスト | `workflow_config.py`・`registry.py`・`main.py`・`tests/` |
| 4 | 例の設定と README | `workflows.bedrock.example.json`・`waha-emulator/README.md`・`onprem/README.md` |
| 5 | 動作確認と code-review の記録 | `docs/issue-452/06`・`08`・`code-review.md` |

## 各コミットメッセージ案

```
#452 issue-452 サービス ID の接尾辞で保存先（インデックス）を自動で切り替える
    - 設定にひな形（kb-learn-* など）を書け、{name} が接尾辞に置き換わるようにする
    - 接尾辞を英小文字・数字・アンダースコアに限り、不正なときは 400 にする
    - 同じ接尾辞の学習・取得・削除・質問が、同じ保存先を指すことをテストで確かめる
```
