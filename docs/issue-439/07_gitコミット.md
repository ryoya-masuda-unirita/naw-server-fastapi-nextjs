# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 00〜02 を作成 | `docs/issue-439/00〜02`・`06` |
| 2 | 03〜07 を作成 | `docs/issue-439/03〜07` |
| 3 | Bedrock の埋め込みを専用ファイルとして追加する | `embedding/bedrock.py`・`embedding/factory.py`・`retrieval/query_embedding.py`・埋め込み・検索アダプタの ID の表と `SUPPORTED_VENDORS`・新規テスト・既存テストへの追加・`generative-ai-adapter/README.md` |
| 4 | onprem と waha-emulator に、学習・検索の例と手順を足す | `onprem/*`・`waha-emulator/tests/*` |
| 5 | 動作確認・code-review を記録する | `08_動作確認.md`・`code-review.md` |

## 各コミットメッセージ案

```
#439 issue-439 00_チケット内容.md〜02_基本設計.md を作成
    - Bedrock の埋め込みモデルを使うための要件定義と基本設計を書く
    - モデルは Titan G1（1536 次元）、接続先は Bedrock Runtime の方針にする

#439 issue-439 03_詳細設計.md〜07_gitコミット.md を作成
    - 詳細設計・テスト設計・テスト詳細設計・タスクリスト・コミット分割案を書く

#439 issue-439 学習・検索のベクトル化で Bedrock の埋め込みモデルを呼べるようにする
    - Bedrock Runtime の InvokeModel で Titan の埋め込みを呼ぶ実行器を専用ファイルとして追加する
    - 既存のファイルには bedrock-ext の目印つきの数行だけを足し、後から消せるようにする
    - 次元数が 1536 でないときは、保存・検索の前に分かる失敗にする
    - 送信のテストを追加し、既存のテストに確認を足す

#439 issue-439 onprem に Bedrock の学習・検索の例と手順を足す
    - 学習・検索の登録例と、回答の生成とは別の接続先を使うことの説明を足す

#439 issue-439 動作確認と code-review を記録する
    - 08_動作確認.md と code-review.md を作成する
```

`Co-Authored-By` などのトレーラーは付けない（このプロジェクトの規約）。
