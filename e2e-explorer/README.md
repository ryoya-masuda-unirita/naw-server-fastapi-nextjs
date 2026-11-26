# e2e-explorer — 画面を自動で巡回して「バグの疑い」を探す

画面をブラウザ（Playwright）で自動で巡回し、サーバーの 500・画面の例外・真っ白・表示崩れなどの「バグの疑い」を、再現手順つきの一覧にする道具です。移植元にはない、このリポジトリ独自のものです（リポジトリ全体は [ルート README](../README.md)）。

画面ごとの自動テストは、書いた人が想定した操作しか確かめません。このハーネスは、次のように想定外の操作を補います。

- ログイン画面から権限ごとにログインし、リンク・ボタン・入力欄・選択肢を 1 つずつ操作して、次の画面へ進むことを繰り返す
- 入力欄には、空・最大文字数・最大+1・記号・HTML 断片・絵文字・負の数・長い文字列などの境界値・異常値を入れて送信する
- 操作のたびに、判定役がサーバーのエラー・画面の例外・真っ白・表示崩れなどを見張り、疑いとして記録する
- 疑いごとに、起点の画面からの再現手順・スクリーンショット・Playwright の trace を付けたレポートを出す
- レポートは Claude Code のスキルで仕分けする。起票は人が判断する

**読み手ごとの入口**

- 初めて動かす人: 「まず動かす」→「やりたいこと別の手順」
- 結果を見る人: 「レポートの読み方」→「仕分けの手順」
- 保守する人: 「仕組み」「設定」「ハーネス自体の開発」

## まず動かす

専用環境の起動 → 巡回 → レポート → 破棄までを、1 コマンドでします。既存のローカル環境には触れません。

```bash
cd e2e-explorer
npm ci
npm run install:browsers   # 初回だけ。Playwright の Chromium
npm run explore:all
```

- 必要なもの: Docker（compose v2）と Node.js 22.18 以上（`.ts` を型除去でそのまま実行するため）
- レポートの場所は最後に表示されます（既定は `reports/<日時>/`）

## やりたいこと別の手順

### 全部まとめて動かす

```bash
npm run explore:all
# 出力先を決める・上限を変える例
npm run explore:all -- --out reports/today --workers 2 --max-minutes 5
```

`--keep-env` を付けると、終わっても専用環境を残します。

### 1 つの担当範囲だけ動かす

担当範囲（シャード）は「画面のまとまり × 権限」の単位です。くわしくは「仕組み」を見てください。

```bash
npm run shards                              # 担当範囲の一覧
npm run explore:all -- --shard chat-admin   # 起動 → この担当範囲だけ巡回 → 破棄
```

`--shard` は複数指定できます。

### 環境を残して、担当範囲を別々に動かす

別のターミナルや別のサブエージェントから担当範囲を実行し、後でまとめることもできます。同じ `--out` を指定すれば、共通の領域の「調査済みの一覧」も共有されます。

```bash
npm run env:up                                            # 起動・マイグレーション・seed・全担当範囲のテナント作成
npm run explore -- --shard chat-admin --out reports/run1
npm run explore -- --shard chat-user  --out reports/run1
npm run merge -- --out reports/run1                       # まとめ直す（explore も終了時にまとめる）
npm run env:down                                          # 破棄（データごと）
```

流し直すときの注意:

- 同じ `--out` で同じ担当範囲を流し直すと、その担当範囲の結果は上書きされます。調査済みの一覧からは、その担当範囲が前に取った分を手放してから始めます（前回の自分の記録で共通の領域を飛ばさないため）
- 同じ環境でもう一度流すと、前回の操作でテナントのデータが変わっている可能性があります
- 完全に同じ条件で再現したいときは、環境を作り直し、`--no-shared-registry` を付けて単独で流します。共有の一覧を使うと、どの担当範囲が共通の領域を調べるかが、実行のタイミングで変わるためです

### レポートを見て、仕分ける

「レポートの読み方」と「仕分けの手順」を見てください。

### 画面が増えたので、担当範囲を足す

画面が移植されて操作が増えたら、`groups` のまとまりを細かく分けると、並列で速く調べられます。例: ユーザー管理（`/admin/users`）が大きくなったら、`admin-people` の範囲を `^/admin/groups(/|$)` に絞り、次を `explorer.config.json` の `groups` に足します。

```json
{
  "id": "admin-users",
  "description": "管理コンソールのユーザー管理（一覧・登録・編集・削除）",
  "startPath": "/admin/users",
  "include": ["^/admin/users(/|$)"],
  "roles": ["admin", "user"]
}
```

- これで `admin-users-admin` と `admin-users-user` の担当範囲ができます
- 範囲が他のまとまりと重ならないようにしてください
- `env:up` を流し直すと、新しい担当範囲のテナントも作られます

### 誤検知を除く

仕分けで誤検知と分かったものは、`explorer.config.json` に足して除きます。足す先は、HTTP の応答なら `oracle.expectedHttp`、コンソールのメッセージなら `oracle.ignoreConsole`、操作しない要素なら `crawl.excludeSelectors` です（くわしくは「設定」）。

### ポートを変える

環境変数 `E2E_POSTGRES_PORT`・`E2E_REDIS_PORT`・`E2E_BACKEND_PORT`・`E2E_FRONTEND_PORT` と、`explorer.config.json` の `target`（または環境変数 `E2E_EXPLORER_BASE_URL`・`E2E_EXPLORER_API_URL`）を合わせます。

## コマンドと引数

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

巡回は削除・権限変更などの破壊的な操作も実行します。そのため、**開発用の環境とは切り離した使い捨ての環境**で動かします。

| サービス | 内容 | ホストのポート |
|---|---|---|
| `postgres` | PostgreSQL 18。データは tmpfs（破棄で消える） | `127.0.0.1:55432` |
| `redis` | Redis 7 | `127.0.0.1:56379` |
| `migrate` | backend のイメージで `alembic upgrade head` | なし |
| `seed` | `server/seed.sql` を投入 | なし |
| `backend` | `server/Dockerfile`（本番用）で作ったイメージ | `127.0.0.1:58000` |
| `frontend` | 今の `client/` を Vite の開発サーバーで動かす | `127.0.0.1:55173` |

- frontend を開発サーバーで動かすのは、React の開発時の警告もコンソールのエラーとして拾うためです
- compose のプロジェクト名は `naw-e2e-explorer` です。ルートの `docker-compose.yml`（`naw-fastapi-postgres` など）とは名前・ポート・データが別で、**既存のローカル環境には触れません**
- ユーザー一括登録の SQS リスナーは止めています（LocalStack が要るため）
- **安全策**: 対象の URL がローカル（`localhost`・`127.0.0.1`・`::1`）以外なら、`--allow-non-local-target` を付けない限り巡回を始めません。dev・本番の環境には向けないでください

## レポートの読み方

出力先（例: `reports/2026-11-13T07-00-00/`）の中身です。

```
report.md              人が読む一覧（GitHub などでそのまま読める）
report.html            人が読む一覧（スクリーンショット付き。ブラウザで開く）
report.json            機械が読む一覧（仕分けのスキル・別のツールが読む）
shared-explored.json   共通の領域の調査済みの一覧（どの担当範囲が調べたか）
shards/<担当範囲>/
  shard-report.json    担当範囲の生の結果（全発生・巡回の順番・担当外・再生できなかった操作）
  artifacts/           スクリーンショット（screenshot-*.png）と trace（trace-*.zip）
```

- **担当範囲の表**: 状態・操作の数、共有で飛ばした操作、担当外への遷移、時間、仮画面の数、**終了理由**が載っています
  - 終了理由の `queue-empty` は、たどれる状態をたどり切ったことを表します
  - `max-actions`・`max-minutes` は、上限で止めたことを表します。調べ残しがあります
  - `error` は、途中で止まったことを表します
- **疑いの一覧**: 重大度（高 → 低）、種類、場所、症状、発生回数、担当範囲が載っています
  - 場所は、API なら `GET /api/xxx`、画面ならパスです。表示崩れは `@画面幅`、axe は `[ルール ID]` が付きます
- **詳細**: 疑いごとに、再現手順（ログイン → 起点を開く → 操作の列）、画面の URL、スクリーンショット、trace、詳細（状態コード・axe の対象など）が載っています
  - trace は `npx playwright show-trace <出力先>/<trace のパス>` で開きます。操作ごとの画面・DOM・通信・コンソールを、時間を追って見られます
  - 再現手順のテナントは専用テナントです。手で再現するときは、seed の `test-tenant` に読み替えてください
- **指紋**: 種類・場所・症状から ID・数字・クエリを除いて作ります。同じ指紋の疑いは 1 件にまとまります
- **担当外への遷移**: 掘らなかった遷移の一覧です。遷移先を担当する担当範囲がなければ、`groups` に足すと調べられます

疑いは**あくまで疑い**です。異常値への 400 を画面が正しく表示している場合のように、仕様どおりのものも混ざります。次の仕分けで判断してください。

## 仕分けの手順

レポートが出たら、Claude Code で仕分けのスキルを使います。

```
/e2e-explorer-triage e2e-explorer/reports/<出力先>
```

（または「e2e-explorer のレポートを仕分けして」）

- スキルは疑いを 1 件ずつ、frontend・backend のコードと移植元に照らして、次のどれかに分けます: **バグ / 未移植 / 仕様どおり / 誤検知 / 判断できない**
- バグと未移植には、Issue の文案を作ります
- **起票は人が判断します**。起票先は必ず `ryoya-masuda-unirita/secuaigent-fastapi-react` です（`gh` には `--repo ryoya-masuda-unirita/secuaigent-fastapi-react` を付ける）。移植元には起票しません
- 誤検知は、`explorer.config.json` の `expectedHttp`・`ignoreConsole`・`excludeSelectors` への追加案として返ります

## 何を見つけられるか

### 見つけられるもの

- **API が 500 番台を返す**（重大度: 高）。ブラウザの通信を見張って判定します
- **API が想定外の 4xx を返す**（中）。同じく通信で判定します。設定で想定内とした応答は除きます（未ログインのセッション確認の 401、異常値を送信した直後の 400 など）
- **通信そのものの失敗**（中）。CORS・接続拒否を、通信の失敗のイベントで拾います
- **ブラウザのコンソールのエラー**（中）。`console.error` です。React の開発時の警告を含みます
- **画面の未処理の例外・Promise の reject**（高）。ページの例外と `unhandledrejection` で拾います
- **画面が真っ白になる**（高）。本文の文字も画像もない状態です
- **操作しても何も起きない**（低）。画面の変化・遷移・通信・ダイアログ・新しいタブのどれもない状態です。ブラウザの入力チェックで止まった送信は除きます
- **操作できる要素がない画面に行き着く**（中）。エラー表示から戻れない場合などです。操作できる要素が 0 個かどうかで判定します
- **表示崩れ**（低）。横スクロール・右端からのはみ出し・枠からの文字のはみ出しです。設定した画面幅（既定: デスクトップ 1280px・スマホ 375px）ごとに、DOM の寸法を見ます
- **アクセシビリティの違反**（中）。axe で見ます。既定は重大度 critical・serious だけです
- **応答が極端に遅い**（低）。API の応答時間と、操作後に落ち着くまでの時間を、しきい値と比べます

### 見つけられないもの

- **仕様どおりかどうか**。たとえば「金額の計算が違う」「一覧の並び順が違う」「権限のないはずのボタンが見えている」は、画面が壊れていなければ疑いになりません。見つけるのは「壊れている兆候」だけです。正しさは、人が書くテストや移植元との比較で確かめます
- **移植元（Angular + Spring）との違い**
- **正しい値でしか進めない先の画面**。入力するのは異常値だけなので、「正しい値で登録した後の画面」には進みません
- **データが要る画面の不具合**。巡回は担当範囲ごとに作る専用テナントで行い、そのテナントにはユーザーしか写していません（アシスタント・グループなどはありません）
- **画面に出ていない操作**。キーボードショートカット、ドラッグ＆ドロップ、ファイルの選択、ホバーだけで出るメニューです
- **複数ユーザーの同時操作**・時間がたつと起きる不具合・メールなど画面の外の結果
- 上限（深さ・操作回数・時間）の外にある画面。上限に達したかは、レポートの「終了理由」で分かります

## 仕組み

```
npm run explore:all
  ├─ 専用環境の起動（docker compose: プロジェクト名 naw-e2e-explorer）
  │    PostgreSQL → alembic でマイグレーション → server/seed.sql を投入 → backend → frontend
  │    担当範囲ごとのテナント（e2e-<担当範囲>）とユーザーを作る
  ├─ 担当範囲（画面のまとまり × 権限）を、並列数ぶんのワーカーで巡回
  │    巡回役（crawler）が状態をたどり、判定役（oracle）が操作ごとに疑いを記録する
  │    全画面に共通の領域（サイドバーなど）の操作は、共有の「調査済みの一覧」で 1 回だけにする
  ├─ 担当範囲ごとの結果を 1 つにまとめる（同じ症状・同じ場所は 1 件にまとめる）
  │    → report.md / report.html / report.json
  └─ 専用環境の破棄（データごと）
```

### 巡回役（`src/crawler.ts`）

- **状態**: 次の 2 つから作るキーで識別します。同じ状態は二度たどりません。文言の数字が変わるだけでは、別の状態になりません
  - URL のパス（UUID・数字は `:id` にそろえる）
  - 操作できる要素の構造（タグ・役割・名前・種類の集合）
- **操作**:
  - リンク・ボタンのクリック（役割がボタン・リンク・タブ・メニュー項目の要素を含む）
  - チェックボックスの切り替え、選択肢の選択
  - フォームへの入力と送信（フォーム内の欄すべてに同じ種類の値を入れて送信する。種類ごとに 1 操作と、種類を混ぜた 1 操作）
  - フォーム外の入力欄への入力と Enter
- **操作しないもの**: 別オリジンへのリンク、新しいタブで開くリンク、ダウンロードのリンク、`data-e2e-explorer-skip` 属性の付いた要素（`crawl.excludeSelectors` で追加できる）
- **戻り方**:
  - SPA には前の状態に戻す一般的な方法がないため、**操作のたびに新しいタブで起点を開き、そこまでの操作を再生**してから次の操作をします。再生の手順が、そのまま再現手順になります
  - 要素は「署名（タグ・役割・名前など）と、同じ署名の中での順番」で毎回探し直します。見つからなければ「再生できなかった操作」として記録します（疑いではありません）
- **探索の順番**: 幅優先です。1 つの状態の中で試す操作の順番は、乱数の種と状態のキーから決めます。**同じ設定・同じ種・同じデータなら、同じ順で巡回します**
- **ログイン**:
  - 権限ごとに、React のログイン画面（テナント ID・ユーザー ID・パスワード）に入力してログインします
  - このアプリはテナント ID を sessionStorage に持ちます（タブごとに消える）。そのため、ログイン後の sessionStorage を控えて、新しいタブを開くたびに戻します
  - ログアウトの操作などでセッションが切れていたら、ログインし直します
- **ダイアログ**: `confirm` などは既定で承認します（`crawl.dialogs`）。ログアウトの確認も承認されるため、ログアウトも巡回の対象です
- **上限**: 深さ・担当範囲ごとの操作回数・1 状態あたりの操作数・時間です。時間を過ぎても応答のない待ちで止まっている場合は、さらに 60 秒で打ち切ります

### 判定役（`src/oracle.ts`）

- 操作の直前に見張りを始め、操作が終わって通信が落ち着く（`timing.settleQuietMs` のあいだ通信がない）まで待ってから判定します
- **再生中に起きたものは数えません**。前の操作の疑いとして記録済みのためです
- 表示崩れと axe は、状態に初めて来たときだけ判定します

### 担当範囲（シャード）と並列実行

巡回の担当は **「画面のまとまり × 権限」** で分けます。これを担当範囲（シャード）と呼びます。ID は `<まとまりの ID>-<権限>` です。

- **重ならない**
  - 担当範囲は、範囲内とみなす URL のパターン（`include`）を持ちます
  - 巡回中に範囲外の URL へ遷移したら、そこは掘らずに「担当外」として記録だけします（レポートの「担当外への遷移」）。範囲外の画面は、その画面を担当する別の担当範囲が調べます
- **共通の要素は 1 回だけ**
  - サイドバー・ヘッダー・ナビゲーションのような、全画面に共通の領域の中の操作は、最初に取った担当範囲だけが操作します。共通の領域は `crawl.sharedRegions` で決めます（既定は `aside`・`header`・`nav`・`[role=navigation]`）
  - 取り合いは、出力先の `shared-explored.json`（調査済みの一覧）で行います。ロックはディレクトリの作成で取るため、**別々のプロセスで担当範囲を実行しても、同じ `--out` を指定すれば共有されます**
  - 権限ごとに分けたいときは `crawl.sharedRegistryPerRole: true` にします
- **データを壊し合わない**
  - 担当範囲ごとに**専用のテナント** `e2e-<担当範囲の ID>` を作ります（32 文字を超えるときは短いハッシュ）。seed の `test-tenant` の設定と、権限の設定にあるユーザー（`admin`・`user01`。ログイン ID・パスワードとも seed と同じ）を写します。DB は共有します
  - ワーカーごとではなく担当範囲ごとに分けるのは、ワーカーの数・担当範囲の割り当てが変わっても、担当範囲を単独で実行しても、他の担当範囲のデータに影響しないようにするためです
- **並列数**: `workers`（既定 4）または `--workers` で決めます。ワーカーは、担当範囲の待ち行列から設定の順に 1 つずつ取ります
- **まとめ**: 担当範囲ごとの結果（`shards/<ID>/shard-report.json`）を、最後に 1 つにまとめます。同じ症状・同じ場所の疑い（指紋が同じもの）は、担当範囲・権限をまたいで 1 件にまとめ、発生回数・担当範囲・権限を併記します

#### 今の担当範囲の分け方

`explorer.config.json` の `groups`（画面のまとまり）と `roles`（権限）で決まります。`npm run shards` で一覧を見られます。

`client/` の全画面のルート（`client/src/routes/index.tsx`。多くは「未移植」の仮画面）に合わせて、次の 9 つのまとまりに分け、権限と組み合わせた 15 の担当範囲があります。

- `auth`: 起点 `/auth/login`、範囲 `^/auth(/login)?$`。権限は未ログイン
- `account`: 起点 `/auth/password/reset`、範囲 `^/auth/password/reset$`。権限は未ログイン・管理者・一般
- `chat`: 起点 `/dashboard`。権限は管理者・一般
  - 範囲は `/`・`/dashboard`・`/chat/…`・`/chat-shared-history/…`・`/feedback-preview/…` です
  - サイドバーもここで調べます
- `library`: 起点 `/library`、範囲 `^/library(/|$)`。権限は管理者・一般
- `legacy-admin`: 起点 `/settings`、範囲は `/settings` 配下。権限は管理者・一般
  - テナント管理者だけに表示されます。一般ユーザーには何も表示されません
- `admin-people`: 起点 `/admin/users`、範囲は `/admin/users`・`/admin/groups` 配下。権限は管理者・一般
  - 一般ユーザーは管理コンソールに入れず、戻されます。権限ガードの確認を兼ねます
- `admin-assistants`: 起点 `/admin/assistants`、範囲は `/admin/assistants`・`templates`・`training-data` 配下。権限は管理者
- `admin-history`: 起点 `/admin/chat-history`、範囲は `/admin/chat-history`・`feedback` 配下。権限は管理者
- `admin-tenant`: 起点 `/admin/tenant`、範囲は `/admin/tenant`・`management` 配下。権限は管理者

権限は 3 つです。seed にある `ADMIN`（テナント管理者 `admin`）と `USER`（一般ユーザー `user01`。グループ管理者ではない）、未ログインです。`SYSTEM` 権限のユーザーとグループ管理者は seed にないため、対象外です。ログインする 13 の担当範囲は、`e2e-<担当範囲>` のテナントを持ちます。

#### 未移植の仮画面の扱い

移植が終わっていない画面は、「未移植: 〇〇（#番号）」と出す仮画面（`NotPortedPage`）です。仮画面は製品の画面ではないため、`oracle.placeholderMarkers`（既定 `未移植: `）を含む画面では、次のように扱います。

- 「操作しても何も起きない」「操作できる要素がない」は、疑いにしません
- 表示崩れ・axe は、画面ごとに同じ枠（サイドバー・ヘッダー）が出るだけなので、場所を `[未移植の仮画面]` に 1 つにまとめて記録します。枠そのものの不具合は見つかります
- API のエラー・コンソールのエラー・画面の例外は、仮画面でも疑いにします（仮画面の文字そのもののはみ出しだけは見ません）
- 仮画面に着いた状態の数は、レポートの担当範囲の表の「仮画面」の列に出ます
- 画面が移植されて仮画面でなくなれば、自動で通常の判定になります

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
| `timing.settleQuietMs` | 落ち着いたとみなす無通信の時間（ms） | 400 |
| `timing.settleTimeoutMs` | 落ち着くまで待つ上限（ms） | 8000 |
| `timing.navigationTimeoutMs` | 画面を開く上限（ms） | 20000 |
| `oracle.slowResponseMs` / `slowActionMs` | 遅いとみなすしきい値（ms） | 3000 / 5000 |
| `oracle.axe` / `axeImpacts` | axe を使うか / 記録する重大度 | true / critical・serious |
| `oracle.viewports` | 表示崩れを見る画面幅 | 1280x800・375x812 |
| `oracle.expectedHttp` | 想定内とする 4xx（下記） | 下記 |
| `oracle.placeholderMarkers` | 画面の文字にこれが含まれたら、未移植の仮画面として扱う | `未移植: ` |
| `oracle.ignoreConsole` | 無視するコンソールのメッセージ（正規表現。下記） | 下記 |
| `crawl.inputKinds` | 入れる値の種類 | 下記 |
| `crawl.defaultMaxLength` / `longLength` | maxlength のない欄の「最大」/ 長い文字列の長さ | 255 / 5000 |
| `crawl.dialogs` | ダイアログへの応答 | `accept` |
| `crawl.excludeSelectors` | 操作しない要素 | `[data-e2e-explorer-skip]` |
| `crawl.sharedRegions` | 共通の領域 | `aside`・`header`・`nav`・`[role=navigation]` |
| `crawl.sharedRegistryPerRole` | 調査済みの一覧を権限ごとに分けるか | false |
| `tenants.perShard` / `prefix` | 担当範囲ごとにテナントを作るか / テナント ID の接頭辞 | true / `e2e-` |
| `roles` | 権限（`anonymous: true` または `loginId`・`password`・`sourceTenantId`） | anonymous・admin・user |
| `groups` | 画面のまとまり（`id`・`description`・`startPath`・`include`・`roles`） | 上の 9 つ |
| `environment.composeFile` / `projectName` | 専用環境 | `docker/compose.yml` / `naw-e2e-explorer` |

表に収まらないものです。

- **`oracle.expectedHttp`**: 項目は `method`・`path`・`status`・`pagePath`（応答時の画面のパス）・`onlyAfterAbnormalInput` です。既定で想定内にしているのは、次の 2 つです
  - 認証画面でのセッション確認の 401
  - 異常値を送信した直後の 400・401・403・422・429
- **`oracle.ignoreConsole`**: 既定は、`Failed to load resource` と `[API] Forbidden:` など、4xx の API ログです。どちらも HTTP の判定で拾うため、無視します。5xx のログは無視しません
- **`crawl.inputKinds`**: 既定は `empty`・`whitespace`・`max`・`maxPlus1`・`symbols`・`markup`・`emoji`・`negative`・`long`・`mixed` です
- 数の欄には文字を入れられないため、種類ごとに数の境界値（`2147483647`・`2147483648`・`-1`・`1e3` など）に置き換えます

## ハーネス自体の開発

```bash
npm run lint
npm run typecheck
npm test
```

単体テスト（`tests/*.test.ts`）は専用環境を使いません。`tests/fixtures/test-site.ts` が、ブラウザの通信を横取りして小さなテスト用サイトを返します（500 を返すボタン、コンソールのエラー、幅の広い要素、フォーム、ログイン画面など）。これで判定役・巡回役・調査済みの一覧・レポート・設定を確かめます。テストのファイル名を `*.spec.ts` にしないのは、ルートの `.gitignore` が `*.spec` を除外しているためです。

### ファイル一覧

| ファイル | 役割 |
|---|---|
| `src/cli.ts` | コマンドの入口 |
| `src/config.ts` | 設定の読み込み・検証・担当範囲の展開・安全策 |
| `src/crawler.ts` | 巡回役（1 つの担当範囲） |
| `src/oracle.ts` | 判定役 |
| `src/page-scripts.ts` | ページの中で動かす関数（要素の列挙・表示崩れ・真っ白・変化の見張り） |
| `src/auth.ts` | ログイン画面を通したログインと sessionStorage の復元 |
| `src/inputs.ts` / `src/rng.ts` | 境界値・異常値 / 種付きの乱数 |
| `src/errors.ts` / `src/types.ts` | エラーの型 / 設定・結果の型 |
| `src/shared-registry.ts` | 調査済みの一覧（ファイルロック） |
| `src/scheduler.ts` | 並列実行とまとめ |
| `src/report.ts` | 指紋・まとめ・JSON / Markdown / HTML の出力 |
| `src/environment.ts` / `src/tenant-sql.ts` | 専用環境の操作 / 担当範囲ごとのテナントを作る SQL |
| `docker/` | 専用環境の compose と frontend の Dockerfile |
