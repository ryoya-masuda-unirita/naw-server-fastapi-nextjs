# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを追加 | `docs/issue-298/` |
| 2 | 生成AIアダプタの core（chat・network・provider・media）を移植 | `generative-ai-adapter/pyproject.toml`・`generative-ai-adapter/generative-ai-core/src/` ほか |
| 3 | 生成AIアダプタ本体を移植 | `generative-ai-adapter/generative-ai-adapter/src/` |
| 4 | 移植元の Java のテストを移す | `generative-ai-adapter/*/tests/` |
| 5 | エミュレーターのワークフローをアダプタに差し替え | `waha-emulator/`（コード・テスト・Docker・設定の例・README） |
| 6 | README・CLAUDE.md・AGENTS.md・pre-commit を更新 | ルートのドキュメント・`generative-ai-adapter/README.md` |
| 7 | 動作確認の記録とレビュー | `docs/issue-298/08_動作確認.md`・`code-review.md` |

実際には、1 つの機能として動く単位（#2〜#5）が相互に依存するため、ワークスペースの土台・アダプタ・エミュレーターへの差し込み・ドキュメントの 4 つ前後にまとめてコミットする。

## 各コミットメッセージ案

```
#298 issue-298 生成AIアダプタ（core・アダプタ）をPythonに移植しWaha!エミュレーターに差し込む
    - generative-ai-adapter/ を uv ワークスペースとして新設（generative-ai-core・generative-ai-adapter）
    - 通常チャット・RAG 回答・プロバイダ（OpenAI・Azure OpenAI・SecuAiGent）・textData・途中経過を移植
    - 移植元の Java のテストのうち今回の範囲のものを pytest に移す
```

```
#298 issue-298 エミュレーターの仮のチャットを生成AIアダプタを呼ぶワークフローに差し替え
    - サービス ID → アダプタの設定を WAHA_WORKFLOWS_FILE の JSON で持つ
    - Docker のビルドコンテキストをルートにしアダプタを含める
    - 仮のチャット用ワークフローと LLM の接続先の仕組みを削除
```

```
#298 issue-298 README・CLAUDE.md・AGENTS.md と動作確認の記録を追加
    - モノレポ構成と移植対象の表を更新
    - チャット 1 回のログの読み方と Docker での通しの確認手順を generative-ai-adapter/README.md に記載
```
