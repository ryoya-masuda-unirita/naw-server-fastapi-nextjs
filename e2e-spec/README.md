# e2e-spec — 移植元の結合テスト項目書（627 項目）に沿った E2E テスト

## このリポジトリは何のプロジェクトか

このリポジトリ（`naw-server-fastapi-nextjs`）は、ユニリタの企業向け AI チャット管理 SaaS **「SecuAiGent」**（旧称 NAW）を、**Spring Boot（Java）+ Angular から FastAPI（Python）+ React へ移植する**プロジェクトです。

- SecuAiGent は、企業のテナントごとに、社員が使う AI アシスタント（Azure OpenAI などにつなぐチャット、社内文書を検索して答える RAG、社外にデータを出さない SECURE アシスタント）を管理する SaaS です。テナント管理者がユーザー・グループ・アシスタント・プロンプトのテンプレート・学習データなどを管理し、一般ユーザーがチャットで使います
- 移植元は GitLab のモノレポ `secuaigent`（`server/` = Spring Boot、`client/` = Angular など）。このリポジトリでは `backend/`（FastAPI）・`frontend/`（React）・`server-local/` などに移植しています
- 目標は移植元の**完璧なクローン**です（見た目・文言・操作・ルート・入力チェックまで揃える）

## このモジュールは何のためにあるか

移植元（SecuAiGent V1.1.0）には、人が手で確かめた**結合テスト項目書**（ルートの `25DA61_結合テスト項目書_md/`。20 カテゴリ・627 項目。各項目に「テスト方法」「確認内容」「備考」が書かれている）があります。

`e2e-spec` は、この**項目書の 1 項目 = 1 つの Playwright テスト**にして、**React（`frontend/`）+ backend が移植元と同じに動くか**を自動で確かめるためのモジュールです。

- 結果は項目書のサマリと同じ形（カテゴリごとの 項目数・OK・NG・未実施）で集計します
- NG は「移植元の挙動と React/backend の挙動の本当の差」です。原因ごとに `docs/issue-316/` に記録し、Issue にします
- 自動化できない項目（外部サービス・目視が必要なもの）は、理由を付けて「未実施」に残します

姉妹の `e2e-explorer/`（画面を巡回して「壊れている兆候」を探す）は**想定外の操作での不具合**を探します。こちらは**移植元の仕様どおりか**を確かめます。専用環境の起動の仕組みは `e2e-explorer/` と同じ考え方です（ポートとプロジェクト名は別）。

Issue: #316

## 準備（初回だけ）

- Docker（compose v2）と Node.js 22.18 以上

```bash
cd e2e-spec
npm ci
npm run install:browsers   # Playwright の Chromium
```

## 実行方法

### 1 コマンドで全部（起動 → テスト → 集計 → 破棄）

```bash
npm run spec:all
npm run spec:all -- --keep-env                      # 終わっても環境を残す
npm run spec:all -- -- tests/03-login.spec.ts       # Playwright のオプションは `--` の後ろ（ここでは 03 だけ）
```

### 起動済みの環境に対してテストだけ流す

```bash
npm run env:up                       # 初回だけ。起動・マイグレーション・seed・システム管理者の追加
npm test                             # 全部
npm test -- tests/03-login.spec.ts   # ファイル指定
npm test -- -g "03-08"               # 項番指定
npm test -- --headed --workers=1     # 画面を見ながら
npm run env:down                     # 破棄（データごと）
```

> テストの終了後に集計（`reports/latest/summary.md`）が出ます。同じ環境に何度流してもよいように、テストは自分でデータを作り、終わったら消します（下記）。

### コマンド一覧

| コマンド | 内容 |
|---|---|
| `npm run spec:all` | 専用環境の起動 → テスト → 集計 → 破棄 |
| `npm run env:up` / `npm run env:down` | 専用環境の起動 / 破棄 |
| `npm test` | 起動済みの環境に対してテスト（`playwright test`）。集計も出る |
| `npm run report` | `reports/latest/results.json` から集計を作り直す（テストを書き足した後など） |
| `npm run merge -- <results.json>... [--out <dir>]` | 別々に流した結果をまとめる（既定の出力先 `reports/merged/`） |
| `npm run lint` / `npm run typecheck` | ESLint / 型チェック |

### 環境変数

| 変数 | 既定 | 内容 |
|---|---|---|
| `E2E_SPEC_FRONTEND_PORT` | 55273 | 画面のポート |
| `E2E_SPEC_BACKEND_PORT` | 58100 | backend のポート |
| `E2E_SPEC_BASE_URL` / `E2E_SPEC_API_URL` | `http://localhost:<上のポート>` | 画面 / API の URL（ローカル以外は拒否） |
| `E2E_SPEC_WORKERS` | 4 | テストの並列数 |
| `E2E_SPEC_REPORT_DIR` | `reports/latest` | 集計・スクリーンショット・trace の出力先 |
| `E2E_SPEC_PROJECT` | `naw-e2e-spec` | compose のプロジェクト名（ネットワーク・ボリューム・backend のイメージ名が分かれる） |

**同じマシンで専用環境を同時に 2 つ以上動かすとき**（別のワークツリー・別のエージェントなど）は、`E2E_SPEC_PROJECT`・`E2E_SPEC_FRONTEND_PORT`・`E2E_SPEC_BACKEND_PORT` を環境ごとに変える。同じモジュールのディレクトリで同時に流すなら `E2E_SPEC_REPORT_DIR` も変える。

```bash
E2E_SPEC_PROJECT=naw-e2e-spec-b E2E_SPEC_FRONTEND_PORT=55274 E2E_SPEC_BACKEND_PORT=58101 E2E_SPEC_REPORT_DIR=reports/b npm run spec:all
```

## 専用環境

ルートの `docker-compose.demo.yml`（backend・frontend・PostgreSQL・Redis・LocalStack、`backend/seed.sql` + `backend/seed-demo.sql` のデモデータ入り）を、**別のプロジェクト名 `naw-e2e-spec`・別ポート**で起動します。

- 既存の開発用コンテナ（`naw-fastapi-*`）・手元のデモ（`naw-demo`。5173/8001）・`e2e-explorer`（55173/58000）には触れません。ネットワーク・ボリューム・イメージ名（`docker/compose.override.yml` で `naw-e2e-spec-backend` に変更）も別です
- ホストに公開するのは画面（`127.0.0.1:55273`）と backend（`127.0.0.1:58100`）だけです
- `env:up` は、demo の seed に無いシステム管理者（`system-admin`、`docker/spec-seed.sql`）を追加します
- **安全策**: 実行先の URL がローカル（`localhost`・`127.0.0.1`・`::1`）以外のときは起動もテストも拒否します（テストはデータを作成・削除します）
- frontend は今の `frontend/` を Vite の開発サーバーで動かすので、画面を直したら再度 `env:up`（イメージの再ビルド）が要ります

### ログインできるユーザー（`src/users.ts`）

テナントはすべて `test-tenant`。このプロジェクトはサブドメインでテナントを識別せず、ログイン画面でテナント ID を入力します。

| 権限 | `USERS.<キー>` | ユーザー ID | パスワード |
|---|---|---|---|
| システム管理者 | `system` | `system-admin` | `admin@1234` |
| テナント管理者 | `tenantAdmin` | `admin` | `admin@1234` |
| 一般ユーザー | `user` | `user01` | `user01@1234` |
| グループ管理者（「営業部」） | `groupAdmin` | `tanaka` | `admin@1234` |

ほかに seed.sql の `first-login-user`（初回ログイン）・`expired-password-user`（パスワード期限切れ）があります（`FIRST_LOGIN_USER`・`EXPIRED_PASSWORD_USER`。**読むだけ**で使う）。

## テストの書き方（他のカテゴリを担当するエージェント向け）

### 1. 項目書を読む

`25DA61_結合テスト項目書_md/NN_カテゴリ名.md` の表を読みます。列は 項番・小項目・テスト方法・確認内容・担当者・実行結果(1〜3回目)・**備考**。**備考には移植元の実際の挙動**（例: ログイン失敗は 403 と「Authentication failed」）が書かれているので、それを正とします。実行結果が 1 回目 NG で 3 回目 OK なら、直った後の挙動が正です。移植元のコード（`~/Documents/unirita-develop-pj/secuaigent-ref/client`・`server`。**読むだけ**）で確かめます。

### 2. ファイルと名前

- ファイル: `tests/NN-<カテゴリの英語名>.spec.ts`（例 `tests/03-login.spec.ts`）。**1 カテゴリ 1 ファイル**。ほかのカテゴリのファイルは触らない（衝突を避けるため）
- テスト名: **`[カテゴリ-項番] 小項目`**。カテゴリは 2 桁、項番は 2 桁以上（項目書の `20.0` は `20`）。例: `[03-02] 正常ログイン`
  - 項番は集計の鍵です。**テスト名の先頭の `[NN-MM]` を変えない・書き損じない**
  - 1 つの項番を複数のテストに分けてよい（同じ `[NN-MM]` を付ける）。集計は一番悪い結果を採ります（NG > 未実施 > OK）
- テストの意図は日本語のコメント（なぜ）で書く。テスト名の小項目は項目書の文言のままにする
- ファイルの先頭に、項目書へのリンクと、移植元との読み替え（あれば）をコメントで書く

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
| `loginAs(role)` | 画面からログインしてログイン後の画面まで進める。`role` は `system` / `tenantAdmin` / `user` / `groupAdmin`。戻り値は `SeedUser` |
| `adminApi` | テナント管理者でログイン済みの API（`APIRequestContext`）。テストデータの準備に使う |
| `createUser(opts)` | テスト専用のユーザーを API で作る（**終了時に自動削除**）。`{ loginId?, name?, role?, issueLoginKey?, activate?, password? }`。戻り値は `{ id, loginId, password, tenantId, loginKey? }` |
| `uniqueId(prefix)` | 他のテストと衝突しない ID（`prefix-xxxxxxxx`） |

- **seed のユーザー（`USERS.*`）のパスワード変更・ロック・削除・権限変更をしない。** 並列で他のテストが使っています。そういうテストは `createUser` で作ったユーザーでやる
- テストデータは API ヘルパー（`src/api.ts`: `loginApi`・`createUser`・`deleteUser`・`getSessionUser`…）で準備し、テスト対象の操作そのものは**画面から**行う。準備に画面操作を使わない（遅く、壊れやすい）
- 新しいデータの種類（アシスタント・グループなど）の準備ヘルパーが要るときは、`src/api.ts` に足さず、自分のカテゴリ用の `src/api-<カテゴリ>.ts` を作る（共通ファイルの衝突を避ける）。作ったデータは fixture（`test.extend`）の後片付けで必ず消す
- ログイン失敗の連続でロックするなど、**状態が他のテストに響くテストは、そのテスト専用のユーザー**を作る

### 4. Page Object の置き方

画面ごとに `src/pages/<画面>.page.ts`（クラス名 `XxxPage`、ロケーター + 操作 + 文言の定数）。`src/pages/login.page.ts` が見本です。

- ロケーターは `#id`・`getByRole`・`getByLabel`・`getByText` の順に安定するものを選ぶ。CSS クラス名や DOM の位置に頼らない
- 画面の文言は日本語（移植元の `ja.json` と同じ）。定数にして Page Object に置く
- カテゴリ専用の Page Object は自分のファイルを作る。共通のもの（サイドバーなど）を最初に使う人が `src/pages/` に新規作成し、**既存の Page Object を直す必要があるときは最小限に**して PR に書く

### 5. 自動化しない項目（未実施）

自動化できない・しない項目は、**テストを書き、理由を `test.skip` に書く**（書かないと「未作成」になります）。

```ts
test('[07-30] Azure OpenAI の実応答', async () => {
  test.skip(true, '外部サービス（Azure OpenAI）への接続が必要で、専用環境では確かめられないため');
});
```

- 理由は集計の「未実施（skip・理由あり）」にそのまま出ます。「目視が必要」だけでなく**何が必要か**まで書く
- 移植元や環境の都合で、今は確かめられないものも同じ。`test.fixme` は使わない（理由が集計に出ません）

### 6. NG の扱い

- **失敗を隠さない。** `test.fail`・`retries`・テストを緩める（期待値を実際の挙動に合わせる）は禁止。移植元の仕様どおりの期待値で書き、React/backend が違えば NG のまま残す
- ただし、**テストの書き方の間違い**（ロケーターの誤り、待ちの不足、期待値の読み違え）は直す。NG が出たら必ず「本当の差か」を確かめる:
  1. 移植元のコード（`client/`・`server/`）と項目書の備考で、どちらが正しいかを確かめる
  2. React 側のコード（`frontend/src`）・backend（`backend/app`）で原因を特定する
  3. 本当の差なら `docs/issue-316/ng-<カテゴリ>.md` に書く（Issue 起票は担当者が決める。**自動では起票しない**）

`ng-<カテゴリ>.md` の書き方（`docs/issue-316/ng-ログイン.md` が見本）:

```
# NG: NN_カテゴリ名
## 概要（NG 件数、本当の差の件数）
## [NN-MM] 小項目
- 項目書の期待 / 移植元の挙動（コードの場所） / React・backend の挙動 / 原因（コードの場所） / 修正の方針
## テストの誤りだったもの（あれば）
```

### 7. 集計の見方

テストを流すと `reports/latest/` に出ます（`E2E_SPEC_REPORT_DIR` で変更）。

- `summary.md` — 項目書のサマリと同じ形の表（項目数・OK・NG・未実施）と、NG・skip の一覧
- `summary.json` — カテゴリ・項番ごとの状態（`OK` / `NG` / `SKIP` / `NOT_RUN` / `NOT_WRITTEN`）
- `results.json` — 項番ごとの実行結果。別々に流した結果は `npm run merge -- a/results.json b/results.json` でまとめる

未実施の内訳: **skip**（理由つきで書いた）・**未実行**（テストはあるが今回の実行に含まれない）・**未作成**（テストがない）。項目書の項目数と突き合わせるので、**書き漏れた項番は「未作成」として数えられます**。

### 8. 提出前に

```bash
npm run lint && npm run typecheck
npm test -- tests/NN-xxx.spec.ts     # 自分のカテゴリを実際に流し、summary.md の結果を PR に貼る
```

## 構成

```
e2e-spec/
├── docker/
│   ├── compose.override.yml   # demo の compose に重ねる（イメージ名を専用にする）
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
