# Waha!生成AI学習

## ヘッダー情報

- システム名: SecuAiGent
- バージョン: V1.1.0
- コンポーネント名: 結合テスト
- 注記: 解凍後のものはそれぞれ以下の場所に配置・初期インストールを実施する

## テスト項目

| 項番 | 小項目 | テスト方法 | 確認内容 | 担当者 | 実行結果(1回目) | 実行結果(2回目) | 実行結果(3回目) | 備考 |
|---|---|---|---|---|---|---|---|---|
| 1 | 学習 | 学習 ジョブを実行する | ジョブが正常終了した場合<br>c:\SecuAiGent_Test\reject フォルダ内にjsonとtsvファイルが出力される。<br>内容を見てtsvはヘッダーのみ、jsonは    "cleanupFailedCount": 0,　でOK<br><br>ジョブが異常終了した場合<br>c:\SecuAiGent_Test\reject フォルダ内にjsonとtsvファイルが出力される。<br>内容を見て「C:\SecuAiGent_Test\input\XYZ Webアプリケーション仕様書.md」があればOK<br>失敗した場合は開発者に情報提供でjsonとtsvを提出<br><br> | 二宮 | OK | OK |  |  |
| 2 | 学習 | No 1 の続き | No1の後に以下のデータベースの値を確認する<br>c:\SecuAiGent_Test\output\out.tsv を開いて4カラム目のIDを控える<br><br>public.embeddinggraph_vectors4 の fileid が一致するものがある<br>embedding_graph_vectors4."File" のproperties内に一致するidがある<br>graphrag_s02.documents の source_label_sanitizedに一致するIDがある<br><br> | 二宮 | OK | OK |  |  |
| 3.0 | 削除 | No 2 の続き<br>削除 ジョブを開いて[標準1]の文字列を No2 で確認に使用していたfileUniqueIdに変更して、実行する | 正常終了する<br><br>public.embeddinggraph_vectors4 の fileid が一致するものがない<br>embedding_graph_vectors4."File" のproperties内に一致するidがない<br> | 二宮 | OK | OK |  |  |
