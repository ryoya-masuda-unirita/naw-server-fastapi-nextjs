# 07_gitコミット

1コミットにまとめず、ディレクトリごとに分ける。各コミットの時点で、そのディレクトリに関する参照が直っていること。

1. `#399 issue-399 backend/ を server/ にリネームする`
2. `#399 issue-399 frontend/ を client/ にリネームする`
3. `#399 issue-399 infra/ を secuaigent-infra/ にリネームする`
4. `#399 issue-399 server-local/ を secuaigent-server-local/ にリネームする`
5. `#399 issue-399 AI 向けドキュメントと skill の記述を新しい名前に合わせる`
6. `#399 issue-399 動作確認を記録する`

途中のコミットでは CI が通らない場合がある（workflow が複数のディレクトリを参照するため）。PR の最終状態で全ジョブが成功すればよい。
