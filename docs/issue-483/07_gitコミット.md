# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue のドキュメントを追加する | `docs/issue-483/` |
| 2 | 単体の compose を廃止し、まとめて起動する側に足りない設定を足す | `waha-emulator/docker-compose.yml`（削除）、`onprem/docker-compose.yml`、`waha-emulator/.env.example` |
| 3 | 手順書を、まとめて起動する側に合わせて書き換える | `waha-emulator/README.md`、`generative-ai-adapter/README.md`、`README.md`、`client/src/features/chat/README.md`、`onprem/README.md` |
| 4 | 動作確認の記録を追加する | `docs/issue-483/08_動作確認.md`、`docs/issue-483/code-review.md` |

## 各コミットメッセージ案

```
#483 issue-483 Issue のドキュメントを追加する
    - 00_チケット内容.md〜07_gitコミット.md を作成する
```

```
#483 issue-483 waha-emulator 単体の compose を廃止し、onprem の compose に寄せる
    - waha-emulator/docker-compose.yml を削除する
    - onprem の waha-emulator に SOURCE_ALLOWED_DIR と /app/config のマウントを足す
    - waha-emulator/.env.example から compose 専用の項目を削除する
```

```
#483 issue-483 手順書を onprem の compose に合わせて書き換える
    - waha-emulator・generative-ai-adapter・ルートの README の Docker の手順を onprem に寄せる
    - クライアントのチャットの README の古い記述を直す
    - onprem の README にエミュレーターだけの起動を追記する
```

```
#483 issue-483 動作確認と code-review を記録する
    - 実機の確認結果を 08_動作確認.md に書く
    - code-review.md を追加する
```
