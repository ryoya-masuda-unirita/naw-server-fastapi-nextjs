# code-review

## server-local の分（PR #315）

実行時の挙動を変える変更はない（変更した .py すべてで docstring を除いた AST が base と一致）。🔴 は 0 件。

| 重大度 | 指摘 | 対応 |
|---|---|---|
| 🟡 | `post_message_content` の docstring が「Waha! 側の失敗は例外にしない」と書くが、セッションの開始・終了の失敗は例外として伝わる | docstring を実装に合わせて修正し、Raises に `ExternalServiceError` を追記 |
| 🟡 | `update_file` ルーターの docstring の `userId` が実態（差し替え時の登録者）と違う | docstring を修正 |
| 🟡 | `upload_file` の Raises に `RuntimeError`（TSV を読めない場合）がない | 追記 |
| 🟡 | `file_service.update_file` で userId なしの差し替えが Waha! の処理後に 400 になり DB と食い違う（既存の不具合） | 挙動を変えない方針のため対象外。docstring に注意を明記。別 Issue 候補 |
| 🟡 | `sync_files` が Waha! のセッションを try/finally で閉じない（既存の不具合） | 同上。別 Issue 候補 |
| 🟡 | `cleanup` が 1 件の OSError でループを打ち切る（既存。docstring は挙動どおりに書いてある） | 同上。別 Issue 候補 |
| 🔵 | ルート関数の NumPy 形式 docstring が OpenAPI の説明文に出る | 応答は変わらないため許容（02_基本設計.md に記載済み）。隠すなら要約の後に `\f` を入れる方法がある |
| 🔵 | 使い捨ての `check_doc.py` でしか private・Returns/Raises 節の漏れを検出できない | ruff の D ルールで強制できる範囲（public・Parameters）に限る。pydoclint の導入は別 Issue 候補 |
| 🔵 | CI の ruff は uv.lock の 0.17.4、pre-commit は v0.15.20 で版が違う | 既存の運用（backend も同じ）。別途揃えるか検討 |
| 🔵 | push と pull_request の両トリガーで CI が二重に走る | backend-tests.yml と同じ書き方に揃えたもの。まとめて直す余地がある |

## waha-emulator の分（PR #351）

実行時の挙動を変える変更はない（変更した 3 つの .py すべてで docstring を除いた AST が `origin/develop` と一致）。🔴 は 0 件。CI（5 ジョブ）は全て成功。

| 重大度 | 指摘 | 対応 |
|---|---|---|
| 🔵 | 追加した docstring のうち D ルールで検出できるのは public のみ。今回の 11 件はすべて private で、将来の private の漏れは ruff では落ちない | 既知の制約（server-local と同じ）。pydoclint の導入は別 Issue 候補 |
| 🔵 | CI の ruff は uv.lock の版、pre-commit は v0.15.20 で版が違う | 既存の運用。別途揃えるか検討 |
