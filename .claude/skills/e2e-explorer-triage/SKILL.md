---
name: e2e-explorer-triage
description: Use when the user asks to triage (仕分け) a report produced by e2e-explorer (the E2E exploration harness in e2e-explorer/), i.e. to read reports/<run>/report.json or report.md, decide for each suspicion whether it is a real bug, intended behavior, an unported feature, or a harness false positive by checking the frontend/backend code and the reference implementation, and draft GitHub Issue texts. Drafts only — never files Issues itself; the human decides. Do not use for running the crawl itself (see e2e-explorer/README.md) or for fixing the bugs.
---

# E2E 探索レポートの仕分け

`e2e-explorer/`（画面操作を再帰的にたどってバグの疑いを検出するハーネス）が出したレポートを読み、疑いごとに「本当にバグか」をコードに照らして判断し、Issue の文案を作る。

**起票はしない。** 文案をユーザーに示し、起票するかは人が判断する。ユーザーに起票を頼まれた場合も、起票先は必ず `--repo ryoya-masuda-unirita/naw-server-fastapi-nextjs` と明記し、移植元（`secuaigent` の GitLab・`visionary-tech-hub/*`）には絶対に起票しない。

## 入力

- レポートの出力先（例: `e2e-explorer/reports/2026-11-13T07-00-00/`）。指定がなければ `e2e-explorer/reports/` の一番新しいディレクトリを使い、どれを使ったかを最初に伝える
- 読むファイル
  - `report.json`: 機械が読む一覧。`groups[]` が同じ症状・同じ場所をまとめた疑い。`example` に再現手順（`steps`）・画面の URL・スクリーンショット・trace のパスがある
  - `report.md`: 人が読む一覧（同じ内容）
  - `shards/<担当範囲>/shard-report.json`: 担当範囲ごとの生の結果（全発生・巡回の順番・担当外への遷移・再生できなかった操作）
  - スクリーンショット（`shards/<担当範囲>/artifacts/screenshot-*.png`）は Read で画像として見られる。trace は `npx playwright show-trace <パス>` で人が開く（Claude は開けないので、必要ならユーザーに頼む）

## 手順

1. `report.json` の `totals` と `shards[]` を読み、巡回が最後まで回ったか（`stats.stoppedBy`・`error`・`replayFailures`）を確かめる。途中で止まった担当範囲があれば、その旨と理由を先に伝える（疑いが 0 件でも「調べていないだけ」の可能性があるため）
2. 疑いを重大度の高い順に 1 件ずつ仕分ける。件数が多いときは、高 → 中 → 低の順で、低は種類ごとにまとめて扱ってよい
3. 1 件ごとに次を確かめる
   - **再現手順**（`example.steps`）とスクリーンショットから、どの画面で何をしたときの症状かを把握する
   - **frontend のコード**（`frontend/src/`）: その画面のコンポーネント・呼んでいる API・エラー処理
   - **backend のコード**（`backend/app/`）: 該当する API の router・service・schema。500 なら例外の出どころ、4xx なら返す条件
   - **移植元**（`~/Documents/unirita-develop-pj/secuaigent-ref/`。読むだけ。`git checkout` / `git pull` はしない）: 同じ画面・API が移植元でどう振る舞うか。移植元と同じ振る舞いなら「仕様どおり」の根拠になる
   - 必要なら backend の単体テストで再現を試す（`cd backend && uv run pytest ...`）。専用環境を起動して確かめる場合は `e2e-explorer/README.md` の手順で行い、既存のローカル環境（`naw-fastapi-*`）には触れない
4. 次のどれかに判定する

   | 判定 | 意味 | 文案 |
   |---|---|---|
   | バグ | 移植元と違う・明らかに壊れている（500、未処理の例外、真っ白、戻れないなど） | 作る |
   | 未移植 | 画面・API が移植途中で、まだないことによる症状（リンク先の画面がない、API が 404 など） | 既存の移植 Issue があればその番号を示す。なければ作る |
   | 仕様どおり | 移植元も同じ振る舞いで、意図したもの（異常値への 400 と入力エラーの表示など） | 作らない。根拠（移植元のファイル）を書く |
   | 誤検知 | ハーネスの判定が合っていない（意図した横スクロールの表、外部のフォント読み込みの失敗など） | 作らない。`explorer.config.json` の `expectedHttp`・`ignoreConsole`・`excludeSelectors` の追加案を示す |
   | 判断できない | 情報が足りない | ユーザーに確認したいことを書く |

   既存の Issue との重複は `gh issue list --repo ryoya-masuda-unirita/naw-server-fastapi-nextjs --search "<キーワード>" --state all` で確かめる（GraphQL の上限に当たったら `gh api` の REST を使う）。

5. 結果をユーザーに返す（ファイルに書くよう頼まれない限りチャットで）

## 出力の形

最初に一覧の表を出す。

```markdown
| # | 重大度 | 症状 | 場所 | 判定 | 根拠 | 文案 |
|---|---|---|---|---|---|---|
| 1 | 高 | API が 500 番台を返した | POST /api/xxx | バグ | backend/app/services/xxx_service.py で None を参照 | あり（下記 A） |
| 2 | 低 | 横スクロールが出た | /dashboard @mobile | 誤検知 | 表の横スクロールは移植元も同じ | なし（設定の追加案あり） |
```

文案は、このリポジトリの Issue の書き方（`.claude/skills/naw-issue-workflow/SKILL.md`）に合わせ、次の形で書く。タイトルは日本語で何が起きるかを 1 文で。

```markdown
### 文案 A: <タイトル>

起票先: ryoya-masuda-unirita/naw-server-fastapi-nextjs（frontend の不具合なら `frontend-port` ラベルは付けない。移植の続きなら付ける）

## 概要
（何をすると何が起きるか。E2E 探索ハーネスで見つかったこと、レポートの出力先と指紋 `<fingerprint>`）

## 再現手順
1. ...（report の steps をそのまま。テナントは専用テナントなので、手で再現するときは seed の test-tenant に読み替える）

## 期待する動き
（移植元の振る舞い。根拠のファイル）

## 実際の動き
（症状。HTTP の状態コード・コンソールのメッセージなど）

## 原因の見立て
（コードを読んだ結果。確かでないところは「推測」と書く）

## 対象外
（この Issue で直さないこと）
```

## 注意

- この仕分けではバグを直さない。直すのは起票された Issue の作業で行う
- 判定は「コードを読んだ根拠」を必ず書く。推測で「バグ」「仕様どおり」と言い切らない
- テナント識別はサブドメインを使わない方針（ルートの `CLAUDE.md`）。サブドメイン前提の振る舞いがないことは未移植として扱わない
- 専用環境のテナント（`e2e-<担当範囲>`）には seed のデータ（アシスタント・グループなど）を写していない。データがないことによる空の画面は、それだけではバグにしない
