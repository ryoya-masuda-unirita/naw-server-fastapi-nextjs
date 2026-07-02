---
name: feedback-project-pat
description: PR作成後にproject-status-sync.ymlが失敗した場合はgh auth tokenでPROJECT_PATを設定する
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e40fff25-043f-432d-bdb7-debdff006578
---

PR作成後に `project-status-sync.yml` ワークフローが `PROJECT_PAT` 未設定で失敗した場合は、以下のコマンドで即座に対応する。

```bash
gh secret set PROJECT_PAT --body "$(gh auth token)"
gh run rerun <run-id>
```

**Why:** `secrets.PROJECT_PAT` が未設定だと GitHub Projects v2 の操作権限がなく自動ステータス移動が失敗する。`gh auth token` で現在の認証トークンをシークレットとして登録すれば解決できる。

**How to apply:** PR作成直後にワークフローが FAIL になっていたら確認し、原因が PROJECT_PAT 未設定なら上記コマンドを実行する。シークレットは一度登録すれば以降は不要（トークン失効時を除く）。
