# NG: 20_Waha!生成AI連携・21_Waha!生成AI学習・22_Waha!生成AI検索

11 項目（20: 6、21: 3、22: 2）。**NG は 0 件**。実際の LLM・外部サービスが要る項目は `test.skip`（理由つき）にした。

確かめ方: 項目書は Waha! のジョブを人が実行する項目。このリポジトリの Waha! エミュレーター（`waha-emulator/`）とアダプタ（`generative-ai-adapter/`）で、同じジョブを servicerun API（`startsession` → `upload` → `execute` → `result` → `download`）で実行した。エミュレーターは `e2e-spec/src/waha-env.ts` がホストの子プロセスとして起動する。ベクトル DB は `onprem/vector-db`（pgvector + PGroonga + Apache AGE）の専用コンテナ。Azure OpenAI は、同じ API の形で応える、テスト専用の HTTP サーバー（モック）。

| 項番 | 結果 | 確かめた内容 / skip の理由 |
|---|---|---|
| 20-01 | OK | Azure OpenAI（モック）に、デプロイ名・api-key・質問つきで chat completions を呼び、outputfile が JSON（`answer` ほか）で正常終了 |
| 20-02 | skip | SecuAiGent プロバイダーはクラウドの `POST /api/llm/chat`（実際の LLM・web_search・推論の途中経過）に接続する。専用環境に LLM がない |
| 20-03 | skip | 同上（textData JSON・アクセストークン・tools） |
| 20-04 | skip | Zapier の MCP サーバーと Slack（外部サービス） |
| 20-05 | OK | RAG（20 件のコンテキスト）。20 件すべてが LLM への入力に入り、回答が出力される（LLM はモック。回答の意味は確かめない） |
| 20-06 | OK | RAG Context JSON。「整合性確認とリストアテスト」を含むコンテキストが LLM への入力と引用資料に入る |
| 21-01 | OK | 学習ジョブ（正常終了: チャンクごとの行が出て、ベクトル DB の行数と一致。異常終了: ファイルなしで `FAILURE: 理由`） |
| 21-02 | skip | ベクトル DB の行（ID・ファイル ID・パス）と同期ジョブの出力は OK。ただし GraphRAG（`embedding_graph`・`graphrag_s02.documents`）への書き込みは、LLM でエンティティを抽出するため確かめられず、同じ項番の別テストを skip にしたので、項番としては未実施 |
| 21-03 | OK | 削除ジョブで、対象ファイルの行がベクトル DB から消え、別ファイルの行は残る。GraphRAG 側は書き込みを有効にしていないため、もともと行がない（この確認は実質的に空） |
| 22-01 | OK | 学習 → 検索（4 件）。references の ID が学習したパート ID。エミュレーターには「検索だけ」のジョブがないため、RAG の回答に入った 4 件で確かめた（項目書の search.tsv の代わり） |
| 22-02 | skip | RAG Context JSON（`schemaVersion`・`generatedAt`・4 件の `contexts` の各項目・`retrievalSignals`）は OK（検索アダプタを Python スクリプトで再現して取得）。`graphEvidence` は GraphRAG に LLM で関係を書くため確かめられず、別テストを skip にしたので、項番としては未実施 |

## 項目書と違う点（差ではない）

- 項目書の `c:\temp\*.txt`・`C:\SecuAiGent_Test\...` は、エミュレーターの outputfile（スロット）に読み替えた。`reject` フォルダの json・tsv は Waha! 本体の出力でエミュレーターにない
- 埋め込みは Echo（キー不要の確認用）。実際の埋め込みモデルには接続しない
- 項目書の `embeddinggraph_vectors4` は、エミュレーターの定義では `public.docs`（`VDB_TABLE_NAME`）

## テストの誤りだったもの（直した）

- RAG の回答は固定の契約（JSON。`id` は「File ID」で 1 始まり）で返す必要があり、プレーンな文章のモックだと「回答が分かりませんでした」になる。モックを契約に合わせた
- ベクトル DB は初期化中に TCP を受けない一時サーバーが動く。TCP で応えるまで待つようにした
