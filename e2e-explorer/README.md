# e2e-explorer — 画面操作を再帰的にたどってバグの疑いを探すハーネス

## このリポジトリは何のプロジェクトか

このリポジトリ（`naw-server-fastapi-nextjs`）は、ユニリタの企業向け AI チャット管理 SaaS **「SecuAiGent」**（旧称 NAW）を、**Spring Boot（Java）+ Angular から FastAPI（Python）+ React へ移植する**プロジェクトです。

- SecuAiGent は、企業のテナントごとに、社員が使う AI アシスタント（Azure OpenAI などにつなぐチャット、社内文書を検索して答える RAG、社外にデータを出さない SECURE アシスタント）を管理する SaaS です。テナント管理者がユーザー・グループ・アシスタント・プロンプトのテンプレート・学習データなどを管理し、一般ユーザーがチャットで使います
- 移植元は GitLab のモノレポ `secuaigent`（`server/` = Spring Boot、`client/` = Angular など）。このリポジトリでは `backend/`（FastAPI）・`frontend/`（React）・`server-local/` などに移植しています
- 移植は画面・API の単位で少しずつ進んでおり、**移植済みの画面が日々増えていきます**

## このハーネスは何のためにあるか

画面ごとの自動テスト（frontend の Vitest、backend の pytest、人が書く E2E テスト）は、**書いた人が想定した操作しか確かめません**。想定外の操作の順番、異常な入力、権限の違いで起きる不具合（サーバーの 500、画面の例外、真っ白な画面、表示崩れなど）は、誰かが実際に触るまで見つかりません。移植の途中では画面が次々に増えるため、人が全部を触り続けるのは無理があります。

`e2e-explorer` は、**ブラウザ（Playwright）で実際の画面を自動で巡回し、「バグの疑い」を一覧にする**ためのハーネスです。

1. ログイン画面からログインし（権限ごと）、画面にあるリンク・ボタン・入力欄・選択肢を洗い出して 1 つずつ操作し、次の画面・状態へ進む、を再帰的に繰り返す
2. 入力欄には、空・最大文字数・最大+1・記号・HTML 断片・絵文字・負の数・長い文字列などの**境界値・異常値**を入れて送信する
3. 操作のたびに、サーバーのエラー・画面の例外・真っ白・表示崩れなどを**判定役**が見張り、疑いとして記録する
4. 疑いごとに、**起点の画面からの再現手順**・スクリーンショット・Playwright の trace（通信の記録を含む）を付けたレポートを出す
5. レポートは Claude Code のスキル（`.claude/skills/e2e-explorer-triage/`）で仕分けし、本当にバグかをコードに照らして判断して Issue の文案を作る。**起票は人が判断する**

移植元にはこの種の仕組みはなく、このリポジトリ独自のものです。

### 見つけられるもの

| 症状 | 判定のしかた | 重大度 |
|---|---|---|
| API が 500 番台を返す | ブラウザの通信を見張る | 高 |
| API が想定外の 4xx を返す | 同上。設定で想定内とした応答（未ログインのセッション確認の 401、異常値を送信した直後の 400 など）は除く | 中 |
| 通信そのものの失敗（CORS・接続拒否） | 通信の失敗のイベント | 中 |
| ブラウザのコンソールのエラー | `console.error`（React の開発時の警告を含む） | 中 |
| 画面の未処理の例外・Promise の reject | ページの例外・`unhandledrejection` | 高 |
| 画面が真っ白になる | 本文の文字も画像もない | 高 |
| 操作しても何も起きない | 画面の変化・遷移・通信・ダイアログ・新しいタブのどれもない（ブラウザの入力チェックで止まった送信は除く） | 低 |
| 操作できる要素がない画面に行き着く（エラー表示から戻れない） | 操作できる要素が 0 個 | 中 |
| 表示崩れ（横スクロール・右端からのはみ出し・枠からの文字のはみ出し） | 設定した画面幅（既定: デスクトップ 1280px・スマホ 375px）ごとに DOM の寸法を見る | 低 |
| アクセシビリティの違反 | axe（既定は重大度 critical・serious だけ） | 中 |
| 応答が極端に遅い | API の応答時間・操作後に落ち着くまでの時間をしきい値と比べる | 低 |

### 見つけられないもの

- **仕様どおりかどうか**。たとえば「金額の計算が違う」「一覧の並び順が違う」「権限のないはずのボタンが見えている」は、画面が壊れていなければ疑いになりません。見つけるのは「壊れている兆候」だけで、正しさは人が書くテストや移植元との比較で確かめます
- **移植元（Angular + Spring）との違い**（この Issue の対象外）
- **正しい値でしか進めない先の画面**。入力するのは異常値だけなので、「正しい値で登録した後の画面」には進みません
- **データが要る画面の不具合**。巡回は担当範囲ごとに作る専用テナントで行い、そのテナントにはユーザーしか写していません（アシスタント・グループなどはない）
- **画面に出ていない操作**（キーボードショートカット、ドラッグ＆ドロップ、ファイルの選択、ホバーだけで出るメニュー）
- **複数ユーザーの同時操作**・時間がたつと起きる不具合・メールなど画面の外の結果
- 上限（深さ・操作回数・時間）の外にある画面。上限に達したかはレポートの「終了理由」で分かります

疑いは**あくまで疑い**です。異常値への 400 を画面が正しく表示している場合のように、仕様どおりのものも混ざります。仕分け（下記）で判断してください。

## 仕組み

```
npm run explore:all
  ├─ 専用環境の起動（docker compose: プロジェクト名 naw-e2e-explorer）
  │    PostgreSQL → alembic でマイグレーション → backend/seed.sql を投入 → backend → frontend
  │    担当範囲ごとのテナント（e2e-<担当範囲>）とユーザーを作る
  ├─ 担当範囲（画面のまとまり × 権限）を並列数ぶんのワーカーで巡回
  │    巡回役（crawler）が状態をたどり、判定役（oracle）が操作ごとに疑いを記録する
  │    全画面に共通の領域（サイドバーなど）の操作は、共有の「調査済みの一覧」で 1 回だけにする
  ├─ 担当範囲ごとの結果を 1 つにまとめる（同じ症状・同じ場所は 1 件にまとめる）
  │    → report.md / report.html / report.json
  └─ 専用環境の破棄（データごと）
```

### 巡回役（`src/crawler.ts`）

- **状態**: 「URL のパス（UUID・数字は `:id` にそろえる）」と「操作できる要素の構造（タグ・役割・名前・種類の集合）」から作るキーで識別します。文言の数字が変わるだけでは別の状態になりません。同じ状態は二度たどりません
- **操作**: リンク・ボタン（役割がボタン・リンク・タブ・メニュー項目の要素を含む）のクリック、チェックボックスの切り替え、選択肢の選択、フォームへの入力と送信（フォーム内の欄すべてに同じ種類の値を入れて送信。種類ごとに 1 操作と、種類を混ぜた 1 操作）、フォーム外の入力欄への入力と Enter
- **操作しないもの**: 別オリジンへのリンク・新しいタブで開くリンク・ダウンロードのリンク・`data-e2e-explorer-skip` 属性の付いた要素（`crawl.excludeSelectors` で追加できる）
- **戻り方**: SPA には前の状態に戻す一般的な方法がないため、**操作のたびに新しいタブで起点を開き、そこまでの操作を再生**してから次の操作をします。再生の手順がそのまま再現手順になります。要素は「署名（タグ・役割・名前など）と、同じ署名の中での順番」で毎回探し直し、見つからなければ「再生できなかった操作」として記録します（疑いではありません）
- **探索の順番**: 幅優先。1 つの状態の中で試す操作の順番は、乱数の種と状態のキーから決めます。**同じ設定・同じ種・同じデータなら、同じ順で巡回します**
- **ログイン**: 権限ごとに React のログイン画面（テナント ID・ユーザー ID・パスワード）に入力してログインします。このアプリはテナント ID を sessionStorage に持つため（タブごとに消える）、ログイン後の sessionStorage を控えて、新しいタブを開くたびに戻します。ログアウトの操作などでセッションが切れていたら、ログインし直します
- **ダイアログ**: `confirm` などは既定で承認します（`crawl.dialogs`）。ログアウトの確認も承認されるため、ログアウトも巡回の対象です
- **上限**: 深さ・担当範囲ごとの操作回数・1 状態あたりの操作数・時間。時間を過ぎても応答のない待ちで止まっている場合は、さらに 60 秒で打ち切ります

### 判定役（`src/oracle.ts`）

操作の直前に見張りを始め、操作が終わって通信が落ち着く（`timing.settleQuietMs` のあいだ通信がない）まで待ってから判定します。**再生中に起きたものは数えません**（前の操作の疑いとして記録済みのため）。表示崩れと axe は、状態に初めて来たときだけ判定します。

### 担当範囲（シャード）と並列実行

巡回の担当は **「画面のまとまり × 権限」** で分けます。これを担当範囲（シャード）と呼び、ID は `<まとまりの ID>-<権限>` です。

- **重ならない**: 担当範囲は、範囲内とみなす URL のパターン（`include`）を持ちます。巡回中に範囲外の URL へ遷移したら、そこは掘らずに「担当外」として記録だけします（レポートの「担当外への遷移」）。範囲外の画面は、その画面を担当する別の担当範囲が調べます
- **共通の要素は 1 回だけ**: サイドバー・ヘッダー・ナビゲーションのような全画面に共通の領域（`crawl.sharedRegions`。既定は `aside`・`header`・`nav`・`[role=navigation]`）の中の操作は、出力先の `shared-explored.json`（調査済みの一覧）を取り合い、最初に取った担当範囲だけが操作します。ロックはディレクトリの作成で取るため、**別々のプロセスで担当範囲を実行しても、同じ `--out` を指定すれば共有されます**。権限ごとに分けたいときは `crawl.sharedRegistryPerRole: true`
- **データを壊し合わない**: 担当範囲ごとに**専用のテナント** `e2e-<担当範囲の ID>`（32 文字を超えるときは短いハッシュ）を作り、seed の `test-tenant` の設定と、権限の設定にあるユーザー（`admin`・`user01`。ログイン ID・パスワードとも seed と同じ）を写します。DB は共有します。ワーカーごとではなく担当範囲ごとに分けるのは、ワーカーの数・担当範囲の割り当てが変わっても、担当範囲を単独で実行しても、他の担当範囲のデータに影響しないようにするためです
- **並列数**: `workers`（既定 4）または `--workers`。ワーカーは担当範囲の待ち行列から設定の順に 1 つずつ取ります
- **まとめ**: 担当範囲ごとの結果（`shards/<ID>/shard-report.json`）を最後に 1 つにまとめます。同じ症状・同じ場所の疑い（指紋が同じもの）は、担当範囲・権限をまたいで 1 件にまとめ、発生回数・担当範囲・権限を併記します

#### 今の担当範囲の分け方

`explorer.config.json` の `groups`（画面のまとまり）と `roles`（権限）で決まります。`npm run shards` で一覧を見られます。今の `frontend/` の画面（ログイン・パスワード再設定・ダッシュボード）に合わせて、次のように分けています。

| 担当範囲 | まとまり | 起点 | 範囲（URL のパス） | 権限 | テナント |
|---|---|---|---|---|---|
| `auth-anonymous` | 認証画面 | `/auth/login` | `^/auth(/\|$)` | 未ログイン | なし |
| `dashboard-admin` | ダッシュボードと共通のサイドバー | `/dashboard` | `^/$`・`^/dashboard(/\|$)` | テナント管理者（`admin`・ADMIN） | `e2e-dashboard-admin` |
| `dashboard-user` | 同上 | 同上 | 同上 | 一般ユーザー（`user01`・USER） | `e2e-dashboard-user` |
| `account-admin` | ログイン後のパスワード再設定 | `/auth/pw-reset` | `^/auth/pw-reset$` | テナント管理者 | `e2e-account-admin` |
| `account-user` | 同上 | 同上 | 同上 | 一般ユーザー | `e2e-account-user` |

権限は seed にある `ADMIN`（テナント管理者）と `USER`（一般ユーザー）、未ログインの 3 つです。`SYSTEM` 権限のユーザーは seed にないため対象外です。

#### 画面が増えたら

`groups` に画面のまとまりを足します。例: ユーザー管理の画面が移植されたら

```json
{
  "id": "users",
  "description": "ユーザー管理（一覧・登録・編集・削除）",
  "startPath": "/admin/users",
  "include": ["^/admin/users(/|$)"],
  "roles": ["admin", "user"]
}
```

を足すと、`users-admin` と `users-user` の担当範囲ができます（一般ユーザーで管理画面を開いたときの振る舞いも調べられる）。範囲が他のまとまりと重ならないようにしてください。`env:up` を流し直すと、新しい担当範囲のテナントも作られます。

## 実行方法

### 準備（初回だけ）

- Docker（compose v2）と Node.js 22.18 以上（`.ts` を型除去でそのまま実行するため）

```bash
cd e2e-explorer
npm ci
npm run install:browsers   # Playwright の Chromium
```

### 1 コマンドで全部（起動 → 巡回 → レポート → 破棄）

```bash
npm run explore:all
# 出力先を決める・上限を変える例
npm run explore:all -- --out reports/today --workers 2 --max-minutes 5
```

レポートの場所は最後に表示されます（既定は `reports/<日時>/`）。`--keep-env` を付けると専用環境を残します。

### 担当範囲を単独で（`--shard`）

```bash
npm run shards                                  # 担当範囲の一覧
npm run explore:all -- --shard dashboard-admin  # 起動 → この担当範囲だけ巡回 → 破棄
```

環境を起動したまま、担当範囲を別々に（別のターミナル・別のサブエージェントから）実行して、後でまとめることもできます。

```bash
npm run env:up                                                     # 起動・マイグレーション・seed・全担当範囲のテナント作成
npm run explore -- --shard dashboard-admin --out reports/run1      # それぞれ同じ --out を指定する
npm run explore -- --shard dashboard-user  --out reports/run1      # （調査済みの一覧も共有される）
npm run merge -- --out reports/run1                                 # まとめ直す（explore も終了時にまとめる）
npm run env:down                                                    # 破棄（データごと）
```

`--shard` は複数指定できます。同じ `--out` で同じ担当範囲を流し直すと、その担当範囲の結果は上書きされ、調査済みの一覧からはその担当範囲が前に取った分を手放してから始めます（前回の自分の記録で共通の領域を飛ばさないため）。同じ担当範囲を同じ環境でもう一度流すと、前回の操作でテナントのデータが変わっている可能性があります。完全に同じ条件で再現したいときは、環境を作り直し、`--no-shared-registry` を付けて単独で流してください（共有の一覧を使うと、どの担当範囲が共通の領域を調べるかは実行のタイミングで変わります）。

### コマンドの一覧

| コマンド | 内容 |
|---|---|
| `npm run explore:all` | 専用環境の起動 → 巡回 → まとめ → 破棄 |
| `npm run env:up` / `npm run env:down` | 専用環境の起動（テナント作成まで）/ 破棄 |
| `npm run explore` | 起動済みの専用環境に対して巡回 |
| `npm run merge -- --out <dir>` | 出力先の担当範囲ごとの結果をまとめ直す |
| `npm run shards` | 担当範囲の一覧 |
| `npm run lint` / `npm run typecheck` / `npm test` | ハーネス自体の lint・型チェック・単体テスト |

| 引数 | 内容 |
|---|---|
| `--shard <ID>` | 担当範囲（複数可。省略時は全部） |
| `--out <dir>` | 出力先 |
| `--workers <n>` / `--seed <n>` | 並列数 / 乱数の種 |
| `--max-depth` / `--max-actions` / `--max-minutes` | 上限 |
| `--config <file>` | 設定ファイル |
| `--keep-env` | `explore:all` の後に専用環境を残す |
| `--no-shared-registry` | 調査済みの一覧を使わない |
| `--headed` | ブラウザを表示する |
| `--allow-non-local-target` | ローカル以外の URL に向けることを許す（通常は使わない） |

## 専用環境

巡回は削除・権限変更などの破壊的な操作も実行するため、**開発用の環境とは切り離した使い捨ての環境**で動かします。

| サービス | 内容 | ホストのポート |
|---|---|---|
| `postgres` | PostgreSQL 18。データは tmpfs（破棄で消える） | `127.0.0.1:55432` |
| `redis` | Redis 7 | `127.0.0.1:56379` |
| `migrate` | backend のイメージで `alembic upgrade head` | — |
| `seed` | `backend/seed.sql` を投入 | — |
| `backend` | `backend/Dockerfile`（本番用）で作ったイメージ | `127.0.0.1:58000` |
| `frontend` | 今の `frontend/` を Vite の開発サーバーで動かす（React の開発時の警告もコンソールのエラーとして拾うため） | `127.0.0.1:55173` |

- compose のプロジェクト名は `naw-e2e-explorer`。ルートの `docker-compose.yml`（`naw-fastapi-postgres` など）とは名前・ポート・データが別で、**既存のローカル環境には触れません**
- ポートを変えるときは、環境変数 `E2E_POSTGRES_PORT`・`E2E_REDIS_PORT`・`E2E_BACKEND_PORT`・`E2E_FRONTEND_PORT` と、`explorer.config.json` の `target`（または環境変数 `E2E_EXPLORER_BASE_URL`・`E2E_EXPLORER_API_URL`）を合わせてください
- **安全策**: 対象の URL がローカル（`localhost`・`127.0.0.1`・`::1`）以外なら、`--allow-non-local-target` を付けない限り巡回を始めません。dev・本番の環境には向けないでください
- ユーザー一括登録の SQS リスナーは止めています（LocalStack が要るため）

## 設定（`explorer.config.json`）

| キー | 内容 | 既定 |
|---|---|---|
| `target.baseUrl` / `target.apiUrl` | frontend / backend の URL | 専用環境 |
| `target.login` | ログイン画面のパスと各欄のセレクター | `/auth/login`・`#tenantId`・`#username`・`#password` |
| `workers` / `seed` | 並列数 / 乱数の種 | 4 / 1 |
| `limits.maxDepth` | 起点から何回の操作先までたどるか | 3 |
| `limits.maxActions` | 担当範囲ごとの操作回数 | 120 |
| `limits.maxActionsPerState` | 1 状態で試す操作の数 | 40 |
| `limits.maxMinutes` | 担当範囲ごとの時間（分） | 10 |
| `timing.settleQuietMs` / `settleTimeoutMs` / `navigationTimeoutMs` | 落ち着いたとみなす無通信の時間 / 待つ上限 / 画面を開く上限 | 400 / 8000 / 20000 |
| `oracle.slowResponseMs` / `slowActionMs` | 遅いとみなすしきい値 | 3000 / 5000 |
| `oracle.axe` / `axeImpacts` | axe を使うか / 記録する重大度 | true / critical・serious |
| `oracle.viewports` | 表示崩れを見る画面幅 | 1280x800・375x812 |
| `oracle.expectedHttp` | 想定内とする 4xx（`method`・`path`・`status`・`pagePath`（応答時の画面のパス）・`onlyAfterAbnormalInput`） | 認証画面でのセッション確認の 401、異常値を送信した直後の 400・401・403・422・429 |
| `oracle.ignoreConsole` | 無視するコンソールのメッセージ（正規表現） | `Failed to load resource`（HTTP の判定で拾うため） |
| `crawl.inputKinds` | 入れる値の種類 | `empty`・`whitespace`・`max`・`maxPlus1`・`symbols`・`markup`・`emoji`・`negative`・`long`・`mixed` |
| `crawl.defaultMaxLength` / `longLength` | maxlength のない欄の「最大」/ 長い文字列の長さ | 255 / 5000 |
| `crawl.dialogs` | ダイアログへの応答 | `accept` |
| `crawl.excludeSelectors` | 操作しない要素 | `[data-e2e-explorer-skip]` |
| `crawl.sharedRegions` / `sharedRegistryPerRole` | 共通の領域 / 権限ごとに分けるか | `aside`・`header`・`nav`・`[role=navigation]` / false |
| `tenants.perShard` / `prefix` | 担当範囲ごとにテナントを作るか / テナント ID の接頭辞 | true / `e2e-` |
| `roles` | 権限（`anonymous: true` または `loginId`・`password`・`sourceTenantId`） | anonymous・admin・user |
| `groups` | 画面のまとまり（`id`・`description`・`startPath`・`include`・`roles`） | auth・dashboard・account |
| `environment.composeFile` / `projectName` | 専用環境 | `docker/compose.yml` / `naw-e2e-explorer` |

数の欄には文字を入れられないため、種類ごとに数の境界値（`2147483647`・`2147483648`・`-1`・`1e3` など）に置き換えます。

## レポートの読み方

出力先（例: `reports/2026-11-13T07-00-00/`）の中身:

```
report.md              人が読む一覧（GitHub などでそのまま読める）
report.html            人が読む一覧（スクリーンショット付き。ブラウザで開く）
report.json            機械が読む一覧（仕分けのスキル・別のツールが読む）
shared-explored.json   共通の領域の調査済みの一覧（どの担当範囲が調べたか）
shards/<担当範囲>/
  shard-report.json    担当範囲の生の結果（全発生・巡回の順番・担当外・再生できなかった操作）
  artifacts/           スクリーンショット（screenshot-*.png）と trace（trace-*.zip）
```

- **担当範囲の表**: 状態・操作の数、共有で飛ばした操作、担当外への遷移、時間、**終了理由**（`queue-empty` = たどれる状態をたどり切った / `max-actions`・`max-minutes` = 上限で止めた / `error` = 途中で止まった）。上限で止まった担当範囲は、調べ残しがあります
- **疑いの一覧**: 重大度（高 → 低）、種類、場所（API なら `GET /api/xxx`、画面ならパス。表示崩れは `@画面幅`、axe は `[ルール ID]`）、症状、発生回数、担当範囲
- **詳細**: 疑いごとの再現手順（ログイン → 起点を開く → 操作の列）、画面の URL、スクリーンショット、trace、詳細（状態コード・axe の対象など）
  - trace は `npx playwright show-trace <出力先>/<trace のパス>` で開くと、操作ごとの画面・DOM・通信・コンソールを時間を追って見られます
  - 再現手順のテナントは専用テナントです。手で再現するときは seed の `test-tenant` に読み替えてください
- **指紋**: 種類・場所・症状から ID・数字・クエリを除いて作ります。同じ指紋の疑いは 1 件にまとまります
- **担当外への遷移**: 掘らなかった遷移の一覧。遷移先を担当する担当範囲がなければ、`groups` に足すと調べられます

## 仕分けの手順

レポートが出たら、Claude Code で仕分けのスキルを使います。

```
/e2e-explorer-triage e2e-explorer/reports/<出力先>
```

（または「e2e-explorer のレポートを仕分けして」）

スキルは疑いを 1 件ずつ、frontend・backend のコードと移植元に照らして **バグ / 未移植 / 仕様どおり / 誤検知 / 判断できない** に分け、バグと未移植には Issue の文案を作ります。**起票は人が判断します**。起票先は必ず `ryoya-masuda-unirita/naw-server-fastapi-nextjs`（`gh` には `--repo ryoya-masuda-unirita/naw-server-fastapi-nextjs` を付ける）で、移植元には起票しません。誤検知は `explorer.config.json` の `expectedHttp`・`ignoreConsole`・`excludeSelectors` への追加案として返ります。

## ハーネス自体の開発

```bash
npm run lint
npm run typecheck
npm test
```

単体テスト（`tests/*.test.ts`）は専用環境を使いません。`tests/fixtures/test-site.ts` が、ブラウザの通信を横取りして小さなテスト用サイト（500 を返すボタン、コンソールのエラー、幅の広い要素、フォーム、ログイン画面など）を返し、判定役・巡回役・調査済みの一覧・レポート・設定を確かめます。テストのファイル名を `*.spec.ts` にしないのは、ルートの `.gitignore` が `*.spec` を除外しているためです。

| ファイル | 役割 |
|---|---|
| `src/cli.ts` | コマンドの入口 |
| `src/config.ts` | 設定の読み込み・検証・担当範囲の展開・安全策 |
| `src/crawler.ts` | 巡回役（1 つの担当範囲） |
| `src/oracle.ts` | 判定役 |
| `src/page-scripts.ts` | ページの中で動かす関数（要素の列挙・表示崩れ・真っ白・変化の見張り） |
| `src/auth.ts` | ログイン画面を通したログインと sessionStorage の復元 |
| `src/inputs.ts` / `src/rng.ts` | 境界値・異常値 / 種付きの乱数 |
| `src/shared-registry.ts` | 調査済みの一覧（ファイルロック） |
| `src/scheduler.ts` | 並列実行とまとめ |
| `src/report.ts` | 指紋・まとめ・JSON / Markdown / HTML の出力 |
| `src/environment.ts` / `src/tenant-sql.ts` | 専用環境の操作 / 担当範囲ごとのテナントを作る SQL |
| `docker/` | 専用環境の compose と frontend の Dockerfile |
