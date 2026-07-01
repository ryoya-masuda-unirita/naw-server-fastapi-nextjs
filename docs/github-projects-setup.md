# GitHub Issues + Projects セットアップ手順

## 1. Projects を作成する

1. `github.com/<user>/naw-server-fastapi-nextjs` を開く
2. 「Projects」タブ → 「New project」をクリック
3. Table ビューでプロジェクトが作成される（テンプレート選択画面は出ない）

## 1-2. Board ビューを追加する

1. プロジェクト上部の「**+ New view**」をクリック
2. 「**Board**」を選択

これでカンバン形式のボードビューが追加される。

## 2. ステータスのカラムを設定する

デフォルトで以下のカラムが作成される。

| カラム | 用途 |
|---|---|
| Todo | 起票済み・未着手 |
| In Progress | 進行中 |
| Done | 完了 |

「レビュー中」カラムを追加する場合：
1. ボードの右端「+ Add column」をクリック
2. カラム名に「In Review」と入力して追加
3. ドラッグで「In Progress」と「Done」の間に移動

## 3. リポジトリと紐づける

1. Projects の「Settings」（右上の `...` メニュー）を開く
2. 左メニュー「Manage access」→「Add repository」
3. `naw-server-fastapi-nextjs` を選択して追加

## 4. Issue を起票する

1. リポジトリの「Issues」タブ → 「New issue」
2. タイトルと本文を入力
3. 右側の「Projects」欄でプロジェクトを選択
4. ステータスを「Todo」に設定して作成

## 5. 作業開始時

1. `bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-XX` を実行する
2. スクリプトにより `develop` 最新化、対応ブランチ作成、Issue への linked branch 反映、GitHub Projects の `In Progress` 更新を自動化する

```bash
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-XX
```

## 6. PR 作成時

1. PR の説明に `Closes #XX` を記載する
2. `.github/workflows/project-status-sync.yml` により、対応 Issue が GitHub Projects の `Review` に自動反映される

```markdown
## 変更概要
- 変更点1

Closes #XX
```

## 7. マージ時

PR が `develop` へマージされると `Closes #XX` の記載により Issue が自動クローズされ、`.github/workflows/project-status-sync.yml` により GitHub Projects 上でも `Done` に自動反映される。
