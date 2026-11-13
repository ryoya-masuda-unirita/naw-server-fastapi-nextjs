# code-review 結果

差分（PR #344）を自分で読んで確認した（移植元との突き合わせ、SQL・秘密の扱い、#300 との重なり、テストの穴）。🔴 は 0 件。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `retrieval/hybrid_bridge.py` | ハイブリッドで FTS にもヒットしたチャンクの出典が `postgresql-pgroonga` になり、ベクトル検索の `sourceRef`・`sourceFilePath` が失われる | 対応しない（移植元の `Accumulator` が最初の候補を残す挙動と同じ。クローンを優先し 03・08 に記載） |
| 2 | 🟡 注意 | `retrieval_adapter/mapper.py` | VDB プロバイダ 0（`Azure AI Search`）は検索プロバイダが未対応になる | 対応しない（移植元のマッパーと同じ。03 とワークスペース README に記載。core の Azure 検索はテストで確認） |
| 3 | 🟡 注意 | `retrieval/query_embedding.py` | OpenAI・Azure の埋め込み HTTP の本文は Spring AI の jar を読んでおらず推定。実 API には未接続 | 対応しない（03・PR 本文に記載。#300 の embedding が入ったら置き換える） |
| 4 | 🔵 提案 | `retrieval/query_embedding.py` ほか | #300 の embedding と機能が一部重なる | 対応しない（衝突を減らす依頼のため。`QueryEmbeddingGenerator` のインターフェースを保ち、`embed_text` の置き換えだけで済むようにした） |
| 5 | 🔵 提案 | `retrieval/postgresql_search.py` | 検索ごとに接続を開く（プールなし） | 対応しない（移植元の `PGSimpleDataSource` と同じ。チャット 1 回あたり数回） |
| 6 | 🔵 提案 | `onprem/docker-compose.yml` | エミュレーターのビルドコンテキストが `../waha-emulator` のままで、#298 の Dockerfile（ルートがコンテキスト）と合わない可能性 | 対応しない（今回の範囲外。#298・#301 の組み合わせの既存の問題として報告） |

## 確認した点（問題なし）

- SQL: テーブル名・graph 名は検証済みの識別子だけを文字列に埋め込み、値（クエリのベクトル・テナント・件数・PGroonga のクエリ）はパラメータで渡している。Cypher の `seedId` は agtype パラメータ
- 秘密: 失敗の要約は `sanitize` を通す。ログにプロパティの値は出さず名前だけ。`CoreVectorDbTarget` の `repr`/`str` は API キー・パスワードを伏せる
- フェイルクローズ: PGroonga の準備不足・AGE/graph/スキーマ不足・Graph 展開の失敗は、ベクトルだけの成功にしない（テストあり）
- 後方互換: `ragContextJson` だけのサービス定義と既定の定義は変更なし（既存のエミュレーターのテスト 132 件が通る）
- core の既存ファイルは変更していない
