# e2e-spec — 移植元の結合テスト項目書（627 項目）に沿った E2E テスト

移植元の結合テスト項目書（627 項目）を、1 項目 1 テストの Playwright にして、React（`client/`）+ backend が移植元と同じに動くかを確かめます（リポジトリ全体は [ルート README](../README.md)）。Issue は #316 です。

**読み手ごとの入口**

- 初めて動かす人: 「まず動かす」→「やりたいこと別の手順」
- テストを書く人: 「テストの書き方」
- 結果を見る人: 「集計の見方」

## まず動かす

専用環境の起動 → テスト → 集計 → 破棄までを、1 コマンドでします。

```bash
cd e2e-spec
npm ci
npm run install:browsers   # 初回だけ。Playwright の Chromium
npm run spec:all
```

- 必要なもの: Docker（compose v2）と Node.js 22.18 以上
- カテゴリ 20〜22（Waha!・オンプレ側）を流すときは、さらに [uv](https://docs.astral.sh/uv/) が要ります。ホストで `waha-emulator/` を `uv run uvicorn` で起動するためです。初回は、`onprem/vector-db` のイメージのビルド（Apache AGE のコンパイル。上限 900 秒）が長くかかります

## このモジュールは何のためにあるか

移植元（SecuAiGent V1.1.0）には、人が手で確かめた**結合テスト項目書**があります（ルートの `25DA61_結合テスト項目書_md/`。20 カテゴリ・627 項目。各項目に「テスト方法」「確認内容」「備考」が書かれている）。`e2e-spec` は、この**項目書の 1 項目を 1 つの Playwright テスト**にして、React + backend が移植元と同じに動くかを自動で確かめます。

- 結果は、項目書のサマリと同じ形（カテゴリごとの 項目数・OK・NG・未実施）で集計します
- NG は「移植元の挙動と React/backend の挙動の本当の差」です。原因ごとに `docs/issue-316/` に記録し、Issue にします
- 自動化できない項目（外部サービス・目視が必要なもの）は、理由を付けて「未実施」に残します
- 姉妹の `e2e-explorer/` は、画面を巡回して「壊れている兆候」を探し、**想定外の操作での不具合**を見つけます。こちらは**移植元の仕様どおりか**を確かめます。専用環境の起動の考え方は同じです（ポートとプロジェクト名は別）

## やりたいこと別の手順

### 全部まとめて動かす

```bash
npm run spec:all
npm run spec:all -- --keep-env                      # 終わっても環境を残す
npm run spec:all -- -- tests/03-login.spec.ts       # Playwright のオプションは `--` の後ろ（ここでは 03 だけ）
```

### 起動済みの環境に対して、テストだけ流す

```bash
npm run env:up                       # 初回だけ。起動・マイグレーション・seed・システム管理者の追加
npm test                             # 全部
npm test -- tests/03-login.spec.ts   # ファイル指定
npm test -- -g "03-08"               # 項番指定
npm test -- --headed --workers=1     # 画面を見ながら
npm run env:down                     # 破棄（データごと）
```

テストの終了後に、集計（`reports/latest/summary.md`）が出ます。同じ環境に何度流してもよいように、テストは自分でデータを作り、終わったら消します。

### 集計だけ作り直す・別々に流した結果をまとめる

```bash
npm run report                                      # reports/latest/results.json から集計を作り直す（テストを書き足した後など）
npm run merge -- a/results.json b/results.json      # 別々に流した結果をまとめる（既定の出力先 reports/merged/）
```

出力先は `--out <dir>` で変えられます。

### 専用環境を 2 つ以上同時に動かす

別のワークツリーや別のエージェントなど、同じマシンで専用環境を同時に動かすときは、環境ごとに次を変えます。

- `E2E_SPEC_PROJECT`（compose のプロジェクト名）
- `E2E_SPEC_FRONTEND_PORT`・`E2E_SPEC_BACKEND_PORT`
- 同じモジュールのディレクトリで同時に流すときは、`E2E_SPEC_REPORT_DIR` も変える

Waha! のエミュレーターのポートは、画面のポートの +1〜+5（既定は 55274〜55278）になります。そのため、**画面のポートは 10 以上離してください**。先頭は `E2E_SPEC_WAHA_PORT` で変えられます。

```bash
E2E_SPEC_PROJECT=naw-e2e-spec-b E2E_SPEC_FRONTEND_PORT=55283 E2E_SPEC_BACKEND_PORT=58101 E2E_SPEC_REPORT_DIR=reports/b npm run spec:all
```

### 新しいカテゴリのテストを書く・NG を調べる

「テストの書き方」を見てください。

## コマンド一覧

| コマンド | 内容 |
|---|---|
| `npm run spec:all` | 専用環境の起動 → テスト → 集計 → 破棄 |
| `npm run env:up` / `npm run env:down` | 専用環境の起動 / 破棄 |
| `npm test` | 起動済みの環境に対してテスト（`playwright test`）。集計も出る |
| `npm run report` | `reports/latest/results.json` から集計を作り直す |
| `npm run merge -- <results.json>... [--out <dir>]` | 別々に流した結果をまとめる |
| `npm run lint` / `npm run typecheck` | ESLint / 型チェック |

### 環境変数

| 変数 | 既定 | 内容 |
|---|---|---|
| `E2E_SPEC_FRONTEND_PORT` | 55273 | 画面のポート |
| `E2E_SPEC_BACKEND_PORT` | 58100 | backend のポート |
| `E2E_SPEC_BASE_URL` / `E2E_SPEC_API_URL` | `http://localhost:<上のポート>` | 画面 / API の URL（ローカル以外は拒否） |
| `E2E_SPEC_WORKERS` | 2 | テストの並列数 |
| `E2E_SPEC_REPORT_DIR` | `reports/latest` | 集計・スクリーンショット・trace の出力先 |
| `E2E_SPEC_PROJECT` | `naw-e2e-spec` | compose のプロジェクト名（ネットワーク・ボリューム・backend のイメージ名が分かれる） |

## 集計の見方

テストを流すと、`reports/latest/` に次が出ます（`E2E_SPEC_REPORT_DIR` で変更）。

- `summary.md`: 項目書のサマリと同じ形の表（項目数・OK・NG・未実施）と、NG・skip の一覧
- `summary.json`: カテゴリ・項番ごとの状態（`OK` / `NG` / `SKIP` / `NOT_RUN` / `NOT_WRITTEN`）
- `results.json`: 項番ごとの実行結果。別々に流した結果は、`npm run merge -- a/results.json b/results.json` でまとめる

未実施の内訳は次の 3 つです。項目書の項目数と突き合わせるので、**書き漏れた項番は「未作成」として数えられます**。

- **skip**: 理由つきで書いたもの
- **未実行**: テストはあるが、今回の実行に含まれないもの
- **未作成**: テストがないもの

## 専用環境

`docker/compose.yml` を、**別のプロジェクト名 `naw-e2e-spec`・別ポート**で起動します。中身は、backend・frontend・PostgreSQL・Redis・LocalStack・LLM のモックです。デモデータ（`server/seed.sql` + `server/seed-demo.sql`）が入ります。

- 既存の開発用コンテナ（`naw-fastapi-*`）・`e2e-explorer`（55173/58000）には触れません。ネットワーク・ボリューム・イメージ名（`naw-e2e-spec-backend`）も別です
- ホストに公開するのは、画面（`127.0.0.1:55273`）と backend（`127.0.0.1:58100`）だけです
- `env:up` は、標準の seed に無いシステム管理者（`system-admin`、`docker/spec-seed.sql`）を追加します
- **安全策**: 実行先の URL がローカル（`localhost`・`127.0.0.1`・`::1`）以外のときは、起動もテストも拒否します（テストはデータを作成・削除するため）
- frontend は、今の `client/` を `npm run build` でビルドし、nginx で静的に配信します（`docker/frontend.Dockerfile`・`docker/nginx.conf`。本番の CloudFront + S3 に近い形）
  - Vite の開発サーバーをやめた理由: 通し実行中にアイドルでも CPU・メモリを大きく使い、並列実行で画面の応答が遅れて、負荷による NG が出たためです（#417）
  - 画面を直したら、再度 `env:up`（イメージの再ビルド）が要ります
- backend の URL は、ビルド時に画面へ埋め込みます（`docker/compose.yml` の frontend のビルド引数 `VITE_API_URL`）。`E2E_SPEC_BACKEND_PORT` を変えたときも、`env:up` でビルドし直されます

### ログインできるユーザー（`src/users.ts`）

テナントはすべて `test-tenant` です。このプロジェクトはサブドメインでテナントを識別せず、ログイン画面でテナント ID を入力します。

| 権限（`USERS.<キー>`） | ユーザー ID | パスワード |
|---|---|---|
| システム管理者（`system`） | `system-admin` | `admin@1234` |
| テナント管理者（`tenantAdmin`） | `admin` | `admin@1234` |
| 一般ユーザー（`user`） | `user01` | `user01@1234` |
| グループ管理者「営業部」（`groupAdmin`） | `tanaka` | `admin@1234` |

ほかに seed.sql の `first-login-user`（初回ログイン）・`expired-password-user`（パスワード期限切れ）があります（`FIRST_LOGIN_USER`・`EXPIRED_PASSWORD_USER`。**読むだけ**で使う）。

## テストの書き方（他のカテゴリを担当するエージェント向け）

### 1. 項目書を読む

`25DA61_結合テスト項目書_md/NN_カテゴリ名.md` の表を読みます。列は、項番・小項目・テスト方法・確認内容・担当者・実行結果（1〜3 回目）・**備考**です。

- **備考には移植元の実際の挙動**（例: ログイン失敗は 403 と「Authentication failed」）が書かれています。それを正とします
- 実行結果が 1 回目 NG で 3 回目 OK なら、直った後の挙動が正です
- 移植元のコード（`~/Documents/unirita-develop-pj/secuaigent-ref/client`・`server`。**読むだけ**）でも確かめます

### 2. ファイルと名前

- ファイル: `tests/NN-<カテゴリの英語名>.spec.ts`（例 `tests/03-login.spec.ts`）。**1 カテゴリ 1 ファイル**です。ほかのカテゴリのファイルは触りません（衝突を避けるため）
- テスト名: **`[カテゴリ-項番] 小項目`**。カテゴリは 2 桁、項番は 2 桁以上です（項目書の `20.0` は `20`）。例: `[03-02] 正常ログイン`
  - 項番は集計の鍵です。**テスト名の先頭の `[NN-MM]` を変えない・書き損じない**
  - 1 つの項番を複数のテストに分けてよいです（同じ `[NN-MM]` を付ける）。集計は一番悪い結果を採ります（NG > 未実施 > OK）
- テストの意図は、日本語のコメント（なぜ）で書きます。テスト名の小項目は、項目書の文言のままにします
- ファイルの先頭に、項目書へのリンクと、移植元との読み替え（あれば）をコメントで書きます

```ts
import { expect, test } from '../src/fixtures.ts';   // @playwright/test ではなく、ここから import する

test.describe('04_ログアウト', () => {
  test('[04-01] ログアウト確認ダイアログ表示', async ({ loginAs, page }) => {
    await loginAs('user');
    // …
  });
});
```

### 3. fixture（`src/fixtures.ts`）

| fixture | 内容 |
|---|---|
| `loginPage` | ログイン画面の Page Object |
| `loginAs(role)` | 画面からログインして、ログイン後の画面まで進める |
| `adminApi` | テナント管理者でログイン済みの API。テストデータの準備に使う |
| `createUser(opts)` | テスト専用のユーザーを API で作る（**終了時に自動削除**） |
| `uniqueId(prefix)` | 他のテストと衝突しない ID（`prefix-xxxxxxxx`） |

- `loginAs(role)`: `role` は `system` / `tenantAdmin` / `user` / `groupAdmin` です。戻り値は `SeedUser` です
- `adminApi`: 型は `APIRequestContext` です
- `createUser(opts)`: `opts` は `{ loginId?, name?, role?, issueLoginKey?, activate?, password? }` です。戻り値は `{ id, loginId, password, tenantId, loginKey? }` です

使い方の決まりです。

- **seed のユーザー（`USERS.*`）のパスワード変更・ロック・削除・権限変更をしない。** 並列で他のテストが使っています。そういうテストは、`createUser` で作ったユーザーでやります
- テストデータは、API ヘルパー（`src/api.ts`: `loginApi`・`createUser`・`deleteUser`・`getSessionUser` など）で準備します。テスト対象の操作そのものは**画面から**行います。準備に画面操作を使いません（遅く、壊れやすいため）
- 新しいデータの種類（アシスタント・グループなど）の準備ヘルパーが要るときは、`src/api.ts` に足さず、自分のカテゴリ用の `src/api-<カテゴリ>.ts` を作ります（共通ファイルの衝突を避けるため）。作ったデータは、fixture（`test.extend`）の後片付けで必ず消します
- ログイン失敗の連続でロックするなど、**状態が他のテストに響くテストは、そのテスト専用のユーザー**を作ります

### 4. Page Object の置き方

画面ごとに `src/pages/<画面>.page.ts` を作ります（クラス名 `XxxPage`。ロケーター + 操作 + 文言の定数）。`src/pages/login.page.ts` が見本です。

- ロケーターは、`#id`・`getByRole`・`getByLabel`・`getByText` の順に、安定するものを選びます。CSS クラス名や DOM の位置に頼りません
- 画面の文言は日本語です（移植元の `ja.json` と同じ）。定数にして Page Object に置きます
- カテゴリ専用の Page Object は、自分のファイルを作ります。共通のもの（サイドバーなど）は、最初に使う人が `src/pages/` に新規作成します
- **既存の Page Object を直す必要があるときは最小限に**して、PR に書きます

### 5. 自動化しない項目（未実施）

自動化できない・しない項目は、**テストを書き、理由を `test.skip` に書きます**（書かないと「未作成」になります）。

```ts
test('[07-30] Azure OpenAI の実応答', async () => {
  test.skip(true, '外部サービス（Azure OpenAI）への接続が必要で、専用環境では確かめられないため');
});
```

- 理由は、集計の「未実施（skip・理由あり）」にそのまま出ます。「目視が必要」だけでなく、**何が必要か**まで書きます
- 移植元や環境の都合で今は確かめられないものも、同じように書きます。`test.fixme` は使いません（理由が集計に出ないため）

### 6. NG の扱い

**失敗を隠さない。** 次は禁止です。

- `test.fail`
- `retries`
- テストを緩めること（期待値を実際の挙動に合わせる）

移植元の仕様どおりの期待値で書き、React/backend が違えば、NG のまま残します。

ただし、**テストの書き方の間違い**（ロケーターの誤り、待ちの不足、期待値の読み違え）は直します。NG が出たら、必ず「本当の差か」を確かめます。

1. 移植元のコード（`client/`・`server/`）と項目書の備考で、どちらが正しいかを確かめる
2. React 側のコード（`client/src`）・backend（`server/app`）で、原因を特定する
3. 本当の差なら、`docs/issue-316/ng-<カテゴリ>.md` に書く（Issue 起票は担当者が決める。**自動では起票しない**）

`ng-<カテゴリ>.md` の書き方です（`docs/issue-316/ng-ログイン.md` が見本）。

```
# NG: NN_カテゴリ名
## 概要（NG 件数、本当の差の件数）
## [NN-MM] 小項目
- 項目書の期待 / 移植元の挙動（コードの場所） / React・backend の挙動 / 原因（コードの場所） / 修正の方針
## テストの誤りだったもの（あれば）
```

### 7. 提出前に

```bash
npm run lint && npm run typecheck
npm test -- tests/NN-xxx.spec.ts     # 自分のカテゴリを実際に流し、summary.md の結果を PR に貼る
```

## 構成

```
e2e-spec/
├── docker/
│   ├── compose.yml            # 専用環境の compose（本番用イメージの backend・画面の静的配信・LLM のモック）
│   ├── frontend.Dockerfile    # 画面のビルドと nginx での配信
│   ├── nginx.conf             # 画面（SPA）の配信設定
│   └── spec-seed.sql          # システム管理者の追加
├── src/
│   ├── cli.ts                 # run / env:up / env:down / report / merge
│   ├── environment.ts         # 専用環境の起動・破棄（docker compose）
│   ├── env.ts                 # URL・ポート・パス
│   ├── users.ts               # 権限別のログインユーザー
│   ├── api.ts                 # API ヘルパー（ログイン・ユーザー作成/削除・セッション取得）
│   ├── fixtures.ts            # 共通 fixture（テストはここから test / expect を import）
│   ├── pages/                 # Page Object
│   └── reporter/              # 項目書の読み込み・集計・Playwright のレポーター
├── tests/                     # NN-<カテゴリ>.spec.ts（カテゴリごとに 1 ファイル）
└── playwright.config.ts
```
