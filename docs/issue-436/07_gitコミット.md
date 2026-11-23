# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 00〜02 を作成（コミット済み） | `docs/issue-436/00〜02`・`06` |
| 2 | 03〜07 を作成 | `docs/issue-436/03〜07` |
| 3 | Bedrock のクライアントを専用ファイルとして追加し、実行できるプロバイダにする | `clients/bedrock.py`・`model.py`・`factory.py`・`vendor.py`・既存テストへの 1 件の追加・新規テスト・`generative-ai-adapter/README.md` |
| 4 | onprem と waha-emulator に、Bedrock の登録例と手順を足す | `onprem/*`・`waha-emulator/README.md`・`waha-emulator/config/workflows.example.json`・`waha-emulator/tests/test_workflow_config.py`・`.gitignore` |
| 5 | 動作確認・code-review を記録する | `08_動作確認.md`・`code-review.md` |

## 各コミットメッセージ案

```
#436 issue-436 03_詳細設計.md〜07_gitコミット.md を作成
    - 詳細設計・テスト設計・テスト詳細設計・タスクリスト・コミット分割案を書く

#436 issue-436 生成AIアダプタから Bedrock（Claude）を呼べる専用のプロバイダを追加する
    - Bedrock を呼ぶ送信部とクライアントを専用ファイルとして追加する（Python 版だけの ID 98）
    - 既存のファイルには、消せるよう目印つきの数行だけを足す
    - 送信のテストを追加し、既存テストに 1 件足す

#436 issue-436 onprem と waha-emulator に Bedrock の登録例と手順を足す
    - compose にワークフロー定義の mount と Bedrock の API キーの受け渡しを足す
    - 登録例・環境変数の例・README の手順を足す

#436 issue-436 動作確認と code-review を記録する
    - 08_動作確認.md と code-review.md を作成する
```

`Co-Authored-By` などのトレーラーは付けない（このプロジェクトの規約）。
