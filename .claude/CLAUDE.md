# naw-server-fastapi-nextjs — Claude 向けプロジェクト設定

@.claude/memory/MEMORY.md

## プロジェクト概要

企業向け AI チャット管理 SaaS の**移植プロジェクト**。

| 移植元（参照リポジトリ） | 移植先（このリポジトリ） |
|---|---|
| Angular → `~/Documents/secuaigent-client` | React（Vite + React Router） → `frontend/` |
| Spring Boot → `~/Documents/naw-server` | FastAPI → `backend/` |

`frontend-angular/` は `secuaigent-client`（Angular）をそのままモノレポに取り込んだもの。React 移植（`frontend/`）が完了するまでの間、バックエンド（`backend/`）の動作確認用フロントエンドとして使う。開発サーバーは `http://localhost:4201`。

**`secuaigent-client` → `frontend-angular/` の同期を意図した指示（文言が曖昧でも）を受けたときは、[frontend-angular-sync skill](skills/frontend-angular-sync/SKILL.md) を呼び出すこと。**

例:「frontendを最新にして」「frontend-angularを最新にして」「secuaigent-clientから持ってきて」「secuaigent-clientからfrontend-angularにソースをコピーして」「Angular側を追従させて」等。

`frontend/`（React移植）ではなく `frontend-angular/` を指しているかどうかの判断に迷う場合は、どちらを指すかユーザーに確認すること。`secuaigent-client` や `frontend-angular` という語が明示されていれば確認不要でこのskillを呼び出してよい。

**両参照リポジトリは日々更新される**。実装前に必ず参照リポジトリの最新状態を確認し、現時点の実装を把握してからポートすること。

ポート作業を行う際は、対応する参照リポジトリのコミット履歴（`git log`）を確認し、何がどの粒度で実装されたかを把握した上でチケット・実装方針を決めること。複数のコミットをまとめてポートしてもよい。

### 参照リポジトリの git 管理状況

| リポジトリ | git 管理状況 |
|---|---|
| `~/Documents/naw-server` | 最初から git 管理。`develop` ブランチあり |
| `~/Documents/secuaigent-client` | 途中から git 管理（別チームが開発した初期実装は git 履歴なし）。`git log` や `git blame` で全履歴を追えない場合がある。最新のコードを読んで実装を把握すること |

---

## 現在の開発方針

**しばらくはバックエンド（`backend/`）優先で開発を進める。**

- Issue 起票・実装対応は `backend/` を優先し、`frontend/`（React 移植）は後回しにする
- バックエンドの動作確認（ブラウザ操作）には `frontend/` ではなく `frontend-angular/`（`http://localhost:4201`）を使う
- **`frontend/`（React）は当面不問とする。動作確認・code review 等で `frontend/` 側の不具合を発見しても、その場で新規 Issue を起票したり修正したりしない。気づいた点があれば会話内で一言触れる程度に留め、対応要否の判断はユーザーに委ねる**
- フロントエンド側の対応が必要な Issue が来た場合は、優先順位についてユーザーに確認すること
- **新しいチケットに着手する際は、作業を始める前に必ず「今回もバックエンド（FastAPI実装）でいいですか？」とユーザーに確認すること**

---

## クラウドインフラ

**環境: dev/staging のみ（本番環境なし）**

| レイヤー | 選定 |
|---|---|
| フロントエンド | CloudFront + S3（SPA 静的デプロイ） |
| バックエンド | AWS ECS（EC2 起動タイプ、t4g.nano）※ メモリ不足時は t4g.micro に変更 |
| DB | Amazon RDS PostgreSQL（db.t4g.micro） |
| コンテナレジストリ | Amazon ECR |
| IaC | Terraform（`infra/` ディレクトリ） |
| CI/CD | GitHub Actions + OIDC（IAM ロール） |
| リージョン | ap-northeast-1 |

### RDS の運用方針

コスト削減のため RDS は**デフォルト停止**。作業前に手動で起動し、終わったら停止する。

```
通常時: 停止（ストレージ代のみ ~$2〜3/月）
作業時: 手動起動 → 使用 → 手動停止
```

**7日自動再起動の回避策**

RDS を手動停止すると AWS が7日後に自動で再起動する制約がある。これを避けるため、EventBridge Scheduler で毎日1回10分間だけ起動・停止するスケジュールを設定する。

```
毎日 09:00 JST → RDS 起動
毎日 09:10 JST → RDS 停止
```

これにより7日連続停止が発生せず、自動再起動は起きない。

---

## モノレポ構成

```
naw-server-fastapi-nextjs/
├── frontend/    # React（Vite + React Router、Angular の移植先）
├── backend/     # FastAPI（Spring Boot の移植先）
└── infra/       # Terraform（AWS インフラ定義）
```

フロントエンド固有の規約は `frontend/.claude/CLAUDE.md`、バックエンド固有は `backend/.claude/CLAUDE.md` を参照すること。

---

## チケット管理

**GitHub Issues + GitHub Projects** を使用する（外部ツールなし）。

- Issue 番号がそのままチケット番号になる（`#1`, `#2`, ...）
- GitHub Projects でステータス管理（起票・進行中・レビュー中・完了）
- PR 説明に `Closes #XX` を書くとマージ時に Issue が自動クローズされる
- Issue 着手時は、原則 `bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}` を使い、`develop` 最新化・ブランチ作成・Issue への linked branch 反映・`In Progress` への移動を自動化する
- PR 作成後は `.github/workflows/project-status-sync.yml` により、対応 Issue を GitHub Projects の `Review` に自動反映する前提で運用する
- PR が `develop` にマージされたら、`Closes #XX` と `.github/workflows/project-status-sync.yml` により GitHub Projects の `Done` まで自動反映される前提で運用する
- Issue 起票の具体的な `gh` コマンド手順・NAW チケット対応の書き方は [.claude/skills/naw-issue-workflow/SKILL.md](skills/naw-issue-workflow/SKILL.md) を参照すること

---

## コミットメッセージのルール

```
#{番号} issue-{番号} 変更概要を1文で
    - 変更詳細
    - 変更詳細
    - ...必要な数
```

NAW チケットに対応する作業の場合は NAW 番号も加える。

```
#{番号} issue-{番号} NAW-XXXX 変更概要を1文で
    - 変更詳細
    - 変更詳細
    - ...必要な数
```

- 1行目: `#{番号}` + 半角スペース + `issue-{番号}` + 半角スペース +（NAW あれば `NAW-XXXX` + 半角スペース）+ 変更概要（日本語1文）
- 2行目以降: 4スペース + `-` + 半角スペース + 変更詳細
- `feat:` / `fix:` などの Conventional Commits プレフィックスは**使わない**
- `Co-Authored-By:` などのトレーラーは**不要**

---

## 作業ブランチ

`main` ブランチ上で直接実装作業を行わない。Issue 対応を開始する際は必ず以下の命名でブランチを作成してから作業すること。

```
# 対応する NAW チケットがある場合
feature/issue-X-NAW-XXXX

# NAW チケットがない場合
feature/issue-X
```

- 新規ブランチは基本的に `develop` から切る
- `develop` はブランチ作成前に必ず最新化する
- `main` からは切らない

### Issue 対応開始時の確認手順

1. 原則 `bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-X` を使って開始する

```bash
bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-X
```

2. 依存する未マージ PR がないかを `gh pr list` で確認する
3. 依存がなければ `develop` から、依存があればその依存ブランチから切る
4. スクリプト未使用時は、ブランチ作成後に対応 Issue への linked branch 反映と GitHub Projects の `In Progress` 移動を手動で行う
5. ユーザーの承認なしに AI がブランチを作成・切り替える
6. ブランチ作成後、要件定義・基本設計（01・02）の作成を開始する

---

## AI仕様駆動開発ドキュメント

実装前に `docs/issue-X/`（NAW チケットあり: `docs/issue-X-NAW-XXXX/`）配下に `00_チケット内容.md`〜`08_動作確認.md` を順番に作成すること。ドキュメントが存在しないまま実装に着手しない。

テンプレート・記載ルール・第1承認（設計承認）／第2承認（実装方式の選択）の承認フロー・Human in the Loop／全自動モードの進め方は [.claude/skills/naw-issue-workflow/SKILL.md](skills/naw-issue-workflow/SKILL.md) と [.claude/skills/naw-issue-workflow/references/doc-templates.md](skills/naw-issue-workflow/references/doc-templates.md) を参照すること（`code-review.md` のフォーマットは [naw-pr-workflow](skills/naw-pr-workflow/SKILL.md) を参照）。

---

## テストコードの命名規則

- テストメソッド名は**英語**で書く
- テストの意図は**日本語 docstring**（`"""`）で書く

```python
async def test_insert_tenant(self, session):
    """テナントをインサートできること"""
    ...
```

---

## 不要コードの削除

変更によって使われなくなったコードは必ず削除すること。呼び出し元・依存先を追って孤立したコードがないかを確認する。

---

## PR作成

ベースブランチの決め方、タイトル・Description のフォーマット、`code-review.md` の記載ルールは [.claude/skills/naw-pr-workflow/SKILL.md](skills/naw-pr-workflow/SKILL.md) を参照すること。
