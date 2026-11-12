# Waha!生成AI連携

## ヘッダー情報

- システム名: SecuAiGent
- バージョン: V1.1.0
- コンポーネント名: 結合テスト
- 注記: 解凍後のものはそれぞれ以下の場所に配置・初期インストールを実施する

## テスト項目

| 項番 | 小項目 | テスト方法 | 確認内容 | 担当者 | 実行結果(1回目) | 実行結果(2回目) | 実行結果(3回目) | 備考 |
|---|---|---|---|---|---|---|---|---|
| 1 | Chat | Azure Chat　ジョブを実行する | ジョブが正常終了する。<br>接続情報を開き、以下の設定値を確認する。<br>生成AIサービスプロバイダー：AzureOpenAI<br><br>以下のファイルを開いて確認する<br>c:\temp\AzureOut.txt　：　Json形式になっている<br> | 二宮 | OK | OK |  |  |
| 2 | Chat | Chat　ジョブを実行する | ジョブが正常終了する。<br>接続情報を開き、以下の設定値を確認する。<br>生成AIサービスプロバイダー：SecuAiGent<br>Tenant ID：test-tenant<br>推論出力先ファイルパス：c:\temp\reasoning.txt<br>SecuAiGent tools name：web_search<br><br>以下のファイルを開いて確認する<br>c:\temp\ChatOut.txt　：　AIの回答がそのまま入っている（NOT JSON)<br>c:\temp\reasoning.txt　：　以下のような生データ<br>data:{"text":"**Preparing weather response in Japanese**\n\nThe","type":"reasoning_delta"}<br>data:{"text":" user","type":"reasoning_delta"}<br> | 二宮 | OK | OK |  |  |
| 3 | Chat | Chat textDatajson　ジョブを実行する | ジョブが正常終了する。<br>接続情報を開き、以下の設定値を確認する。<br>生成AIサービスプロバイダー：SecuAiGent<br>生成AI PI Key：何かしら1文字だけ入っている（見るのはtextData Json)<br>SecuAiGent textData JSON file path:C:\temp\textData.json<br><br>以下のファイルを開いて確認する<br>C:\temp\textData.json<br>{<br>    "streamfilepath":"c:\\temp\\reasoning3.txt",<br>    "createLibrary": false,<br>    "tools": [{"name":"web_search"}],<br>    "accessToken": "eyJhbGciOiJIUzUxMiJ9.eyJ0ZW5hbnRJZCI6InRlc3QtdGVuYW50Iiwic3ViIjoid2FoYS1qb2IiLCJpYXQiOjE3ODI0Nzg1MzUsImV4cCI6MTc4MjQ5NjUzNX0.MHei9vPtrxffRTjYHS0viiTfblIVeTM_NUGgyayzqCFT4dwd8JXgiPK2f0OwKpC_B5DHXqssZXQ35az2VO_G6g"<br>} ※アクセストークンは別途取得する<br>c:\temp\ChatOut.txt　：　Json形式になっている<br>c:\temp\reasoning3.txt　：　以下のような生データ<br>data:{"text":"**Preparing weather response in Japanese**\n\nThe","type":"reasoning_delta"}<br>data:{"text":" user","type":"reasoning_delta"}<br> | 二宮 | OK | OK |  |  |
| 4 | MCP | Ranabaseと同等の認証をしているZapierでテスト<br>Chat MCP ジョブを実行する | ジョブが正常終了する<br>Slackの生成AIソリューションサービスのgeneralに「こんにちは」というメッセージがきたらOK | 二宮 | OK | OK |  |  |
| 5 | RAG | RAG コンテクスト　ジョブを実行する | 正常終了する<br>C:\SecuAiGent_Test\output\RAGChatOut.txt を開くと answer が20件である意味の文章になっている | 二宮 | OK | OK |  |  |
| 6 | RAG | RAG コンテクスト Json　ジョブを実行する | 正常終了する<br>C:\SecuAiGent_Test\output\RAGContextChatOut.txt　を開き、 <br>以下のような意味が含まれていればOK<br>整合性確認とリストアテスト | 二宮 | OK | OK |  |  |
