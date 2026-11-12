# code-review 結果

`/code-review --effort medium` を実行し、8つの調査観点（line-by-line diff scan / removed-behavior auditor / cross-file tracer / reuse / simplification / efficiency / altitude / conventions）でサブエージェントにレビューを委譲した。レビュー範囲はPR#164で実際に書いたコード（`backend/app/services/auth_service.py`・`backend/seed.sql`・`backend/tests/unit/test_auth_service.py`・`frontend-angular/e2e/*`・`playwright.config.ts`・`sync.sh`）に絞った（`frontend-angular`の大半の差分はupstream `secuaigent/client`からの同期による既存コードのため対象外とした）。

correctnessバグ（angle A/B/C）は0件。cleanup系5件を検出した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `frontend-angular/e2e/login.spec.ts` | `no-auth.guard.ts`の既知バグがコードコメントのみで記録され、追跡用のGitHub Issueが存在しなかった | 対応済み |
| 2 | 🔵 提案 | `.claude/skills/frontend-angular-sync/scripts/sync.sh` | `proxy.conf.local.js`を`Dockerfile.dev`と同じ「モノレポ専有ファイル」として除外せず、一度upstreamから同期してから25行のheredocで上書きする回りくどい実装になっていた | 対応済み |
| 3 | 🔵 提案 | `backend/tests/unit/test_auth_service.py` | パスワードリセット系3テスト（`test_login_when_password_reset_required`・`test_login_when_password_expired`・`test_login_when_expired_and_reset_required_returns_expired`）がほぼ同一のセットアップコードを重複させていた | 対応済み |
| 4 | 🔵 提案 | `frontend-angular/playwright.config.ts` | `fullyParallel: true`でワーカー数の上限が未設定で、多コア環境で単一のローカルPostgresコンテナに対して過剰な同時接続が起こりうる | 対応済み |
| 5 | 🔵 提案 | `frontend-angular/e2e/login.spec.ts` | 10個のテストケース全てが`goto('/auth/login')`＋ユーザーID/パスワード入力＋クリックの同じ4行を手書きで繰り返している | 対応しない |

## 詳細

### 1. no-auth.guard.tsバグの追跡Issue未作成（🟡 注意）→ 対応済み

`login.spec.ts`のコメントには「修正は別Issueで対応する」と書かれていたが、実際には該当するGitHub Issueが存在しなかった。このままでは、将来`login.spec.ts`が書き換えられたりコメントが削除されたりすると、この既知の不具合の記録自体が失われてしまう。

Issue #165として起票し、再現手順・原因・対応方針（`auth.guard.ts`と同じパターンで`ensureInitialized()`を追加、`no-auth.guard.spec.ts`の新規作成）を記録した。

### 2. proxy.conf.local.jsの回りくどい上書き処理（🔵 提案）→ 対応済み

同じ`sync.sh`内で`Dockerfile.dev`は「モノレポ専有ファイルなのでrsync対象から最初から除外する」という一貫した方針を取っているのに対し、`proxy.conf.local.js`だけは一度upstreamから同期してから25行のheredocで即座に上書きする実装になっていた。正規のソースがシェルスクリプト内の文字列リテラルになり、JSの構文チェックが効かない上、Dockerfile.devと扱いが不統一だった。

`proxy.conf.local.js`も`rsync --exclude`に追加し、heredoc上書きロジックを削除した。`.claude`・`.codex`両方のスクリプトと`SKILL.md`を修正し、`bash -n`で構文チェック、実際に`npx playwright test`で疎通を再確認した。

### 3. パスワードリセット系テストのセットアップ重複（🔵 提案）→ 対応済み

3つのテストがUser生成・`session.execute`モック・`get_latest`パッチのセットアップをほぼ同一のコードで重複させていた（Rule of Threeに到達）。`_build_login_session`ヘルパーに抽出し、各テストは差分（`is_required_password_reset`・`expired_at`・期待する`reason`）のみを渡す形にした。`pytest`（15件）・`mypy`・`ruff`とも成功を確認済み。

### 4. Playwrightのワーカー数上限未設定（🔵 提案）→ 対応済み

`fullyParallel: true`にワーカー数の明示的な上限がなく、CI環境等コア数の多いマシンでは、ローカルの単一Postgresコンテナに対して想定以上のワーカーが同時接続しうる。`workers: 4`を明示し、コメントで理由を記載した。テスト再実行し11件PASSを確認済み。

### 5. login.spec.tsのログイン操作の重複（🔵 提案）→ 対応しない

10個のテストケース全てが`goto` + フォーム入力 + クリックを個別に記述している。`test.beforeEach`や`authenticatedPage`フィクスチャへの集約も検討したが、E2Eテストでは各テストが自己完結して読める（何をしているかがテスト本体だけで分かる）ことの価値が、行数の重複を許容するコストを上回ると判断した。Playwrightの一般的なプラクティスとしても、E2Eのステップは多少の重複があっても明示的に書く方が可読性・デバッグ容易性で有利とされる。将来テストケースがさらに増えて重複が顕著な負担になった時点で改めて検討する。
