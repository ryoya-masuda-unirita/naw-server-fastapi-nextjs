# code-review 結果

対象: PR #242（`/code-review medium 242`）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `docs/issue-241/06_タスクリスト.md` | PR 上の CI 確認・PR 作成・code-review を、実施前に完了（`[x]`）にしていた | 対応済み |
| 2 | 🟡 注意 | `.github/workflows/frontend-tests.yml` | develop への push 時、`deploy.yml` → `deploy-frontend.yml` でも lint・テスト・ビルドが走り、処理が重複する | 対応しない |
| 3 | 🔵 提案 | `.github/workflows/frontend-tests.yml` | 型チェック（`tsc --noEmit`）とビルドの `tsc -b` が同じ tsconfig を検査しており重複。01 の「ビルドの中で一部行われるのみ」も不正確 | 01 の記述のみ修正 |
| 4 | 🔵 提案 | `.github/workflows/frontend-tests.yml` | `concurrency` がなく、PR に続けて push すると古いコミットの実行が残る | 対応済み |
| 5 | 🟡 注意 | `.github/workflows/frontend-tests.yml` | paths フィルタのため、frontend を変えない PR ではチェックが報告されない。required check に登録すると backend だけの PR がマージできなくなる | 対応しない（PR 本文・本書に注意を記載） |
| 6 | 🔵 提案 | `.github/workflows/frontend-tests.yml` | テストの書き方が `npm test -- --run`（本ワークフロー）と `npx vitest run`（`deploy-frontend.yml`）で違う | 対応しない |
| 7 | 🔵 提案 | `.github/workflows/frontend-tests.yml` | push トリガーが develop のみで main への push を検証しない | 対応しない |
| 8 | 🔵 提案 | `frontend/tsconfig.json` | `include` が `src` だけのため `vite.config.ts` / `vitest.config.ts` が型チェックされない | 対応しない（スコープ外） |

## 詳細

### 1. タスクリストを先に完了扱いにしていた（🔴 致命的）→ 対応済み

PR 上でワークフローが成功したことを `gh pr checks` で確認し、`08_動作確認.md` の「7. PR 上のワークフロー実行結果」に記録してから、`06` の該当項目を完了にした。code-review の項目は本書の作成をもって完了にした。

### 2. develop への push で deploy と処理が重複する（🟡 注意）→ 対応しない

Issue #241 の要件に「develop への push」での実行が含まれている。デプロイワークフローは配信のゲートで、こちらは develop の状態の検証（PR 画面・コミットのステータス）と役割が違う。重複は develop へのマージ時に 1 回分（1 分弱）だけで、許容範囲と判断した。統合する場合（`deploy-frontend.yml` が本ワークフローを `workflow_call` で呼ぶ等）はデプロイの処理を変えることになるため、別 Issue で扱う。

### 3. 型チェックとビルドの tsc が重複する（🔵 提案）→ 01 の記述のみ修正

型チェックの独立ステップは Issue の要件。型エラーを「ビルド失敗」ではなく「型チェック失敗」として見分けられる利点があり、追加時間は数秒のため残す。01 の背景の記述は不正確だったため、「単独のステップとしてはどの CI でも実行されていない（ビルドの中では行われるが、失敗してもビルドの失敗としてしか見えない）」に直した。03 にも重複を承知で分けている理由を書いた。

### 4. concurrency がない（🔵 提案）→ 対応済み

`concurrency.group: ${{ github.workflow }}-${{ github.ref }}` を追加した。`cancel-in-progress` は pull_request のときだけ true にし、develop への push はマージされたコミットごとに結果を残すため取り消さない。

### 5. required check に登録すると frontend を変えない PR がマージできなくなる（🟡 注意）→ 対応しない

ブランチ保護の設定は今回のスコープ外（01 のスコープ外に記載）。`backend-tests.yml` も同じ paths フィルタ方式で、リポジトリの方式に揃えている。required check にする場合は、paths フィルタを外す・ジョブ内で変更判定してスキップ扱いにする等の対応が必要になることを、PR 本文の未確認事項に書いた。

### 6. テストの書き方が deploy-frontend.yml と違う（🔵 提案）→ 対応しない

Issue の要件「コマンドは `frontend/package.json` のスクリプトに合わせる」に従い、`test` スクリプト経由（`npm test -- --run`）にした。`deploy-frontend.yml` 側の書き換えはデプロイ処理の変更になるためスコープ外とした。

### 7. main への push を検証しない（🔵 提案）→ 対応しない

Issue の要件は「develop への push」。main へは develop からの PR でマージされ、その PR（base: main）でこのワークフローが走るため、マージ前に検証される。

### 8. 設定ファイルが型チェックされない（🔵 提案）→ 対応しない

tsconfig の変更（`tsconfig.node.json` の追加等）は今回の CI 追加とは別の話で、既存の型エラーが出る可能性もあるためスコープ外とした。
