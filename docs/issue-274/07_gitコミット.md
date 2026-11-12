# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07） | `docs/issue-274/` |
| 2 | Waha! エミュレーターの実装・テスト・Docker | `waha-emulator/` |
| 3 | README・CLAUDE.md・AGENTS.md・pre-commit の追記 | `README.md`・`CLAUDE.md`・`AGENTS.md`・`.pre-commit-config.yaml` |
| 4 | 動作確認の記録 | `docs/issue-274/06_タスクリスト.md`・`08_動作確認.md` |
| 5 | code-review の結果と修正 | `docs/issue-274/code-review.md` ほか |

## 各コミットメッセージ案

```
#274 issue-274 Waha!エミュレーターの設計ドキュメントを作成
    - docs/issue-274 に 00〜07 を作成
```

```
#274 issue-274 Waha!エミュレーターの土台を追加
    - waha-emulator/ を FastAPI・uv の独立プロジェクトとして新設
    - server-local の WahaClient と同じ servicerun API（セッション・スロット・ジョブ）を実装
    - 仮のチャット用ワークフロー（echo / Azure OpenAI）とストリームファイルへの途中経過の書き込み
    - server-local の WahaClient・SSE から呼ぶ結合テストと Docker の定義を追加
```

```
#274 issue-274 Waha!エミュレーターの起動方法と構成をドキュメントに追記
    - ルート README に起動方法と server-local との組み合わせ方を追記
    - CLAUDE.md・AGENTS.md のモノレポ構成・移植対象の表に waha-emulator/ を追記
    - pre-commit の ruff の対象に waha-emulator/ を追加
```

```
#274 issue-274 動作確認結果を記録
    - 08_動作確認.md にテスト・Docker の確認結果を記録
```
