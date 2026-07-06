# code-review（Issue #34 / PR #35）

## レビュー対象（2回目：pre-commitフレームワーク方式）

`git diff origin/develop...HEAD`（60 files changed, 1865 insertions(+), 359 deletions(-)）

内訳:
- 新規追加: `.pre-commit-config.yaml`、`backend/pyproject.toml`の`pre-commit`依存追加、`backend/.claude/CLAUDE.md`のフック案内の書き換え、`docs/issue-34/*.md`の再設計ドキュメント一式
- 撤去: `.githooks/pre-push`
- 変更なし（前回レビュー済み・再検証不要）: `.github/workflows/backend-tests.yml`の`lint`ジョブ、`backend/pyproject.toml`の`per-file-ignores`、既存44ファイルへの`ruff format`適用差分

3つのfinderエージェント（pre-commit-config正当性／旧方式の参照残存チェック／CLAUDE.md規約・ドキュメント整合性）観点で、新方式に関わる差分に絞って調査した。

---

## 指摘と対応

### 🟡 `.github/workflows/backend-tests.yml`: `lint`ジョブのコメントが撤去済みの`.githooks/pre-push`を参照したままだった

- **内容**: `lint`ジョブの説明コメントが「ローカルの pre-push フック（`.githooks/pre-push`）でも同じチェックを自動修正込みで行っているが」という、既に削除した旧方式を前提とした文言のままになっていた。
- **対応**: `.pre-commit-config.yaml`（コミット時に自動修正込みで実行）を参照する内容に書き換えた。

### 🔵 `docs/issue-34/03_詳細設計.md`: `.pre-commit-config.yaml`のサンプルに記載した`rev`が実装と食い違っていた

- **内容**: 設計ドキュメントのサンプルは`rev: v0.8.6`のままだったが、実際に実装した`.pre-commit-config.yaml`は`rev: v0.15.20`（実装時点でbackendにインストール済みの`ruff 0.15.20`と一致させたバージョン）だった。
- **対応**: ドキュメントのサンプルを実装と一致する`v0.15.20`に修正した。

### 🔵 `.pre-commit-config.yaml`: `ruff`フックIDがlegacy aliasだった

- **内容**: `ruff-pre-commit`では`id: ruff`は`id: ruff-check`のlegacy aliasであり、将来的に廃止される可能性がある。現時点では動作に問題ないが、forward-compatibleではない。
- **対応**: `id: ruff-check`に変更した（挙動は同一）。あわせて`03_詳細設計.md`のサンプルも修正した。

### 検討したが問題なしと判断したもの

- **`files: ^backend/`の正規表現スコープ**: pre-commitは`files`/`exclude`をリポジトリルート相対パスに対して`re.search`で適用する。`^backend/`は文字列先頭に固定され、直後に`/`を要求するため、`backend-old/`や`frontend/backend-utils/`等は誤って一致しない。問題なし。
- **`rev: v0.15.20`のバージョン整合性**: タグの実在、および`backend/uv.lock`で実際に解決される`ruff`（`0.15.20`）との一致を確認済み。エディタ経由の`uv run ruff`とpre-commit経由のRuffで挙動が食い違うことはない。
- **`args: [--fix]`のみで`--exit-non-zero-on-fix`を付けていない点**: 実機検証（スクラッチリポジトリでの再現）により、`ruff check --fix`自体がexit 0で終わる場合でも、pre-commitフレームワークがフック実行前後のワーキングツリー差分を独自に検知して`Failed`扱いにすることを確認済み。修正が黙って素通りすることはない。
- **`backend/uv.lock`の整合性**: `uv sync --locked`が成功することを確認済み。`pre-commit`追加後にlockfileが正しく再生成されている。
- **`pre-commit`依存の配置**: `[dependency-groups].dev`にのみ追加されており、`[project.dependencies]`（本番実行時の依存）には含まれていないことを確認済み。
- **旧方式（`.githooks`・`core.hooksPath`・`pre-push`）への参照残存**: リポジトリ全体をgrepしたが、`backend/.claude/CLAUDE.md`・`docs/issue-34/*.md`以外に生きた参照はなし。ルートの`README.md`・`CONTRIBUTING.md`にも記載なし（`README.md`はそもそも`AGENTS.md`を参照するのみで7行）。`.gitignore`にも該当なし。`backend/.claude/CLAUDE.md`の言及は「以前使用していた…廃止した」という過去形の移行案内として適切。
- **docs/issue-34の内部整合性**: `06_タスクリスト.md`と`08_動作確認.md`の内容は一致しており、`00〜03`のドキュメントもpre-pushのSHA確定バグから設計変更に至った経緯を一貫して説明できている。

---

## 結論

🔴致命的な指摘なし。🟡指摘（CI側の説明コメントの参照ミス）を修正済み。🔵指摘2件（設計ドキュメントの`rev`不一致、legacy alias使用）も修正済み。

---

## 付録：1回目のレビュー記録（旧方式・`.githooks/pre-push`）

> 以下は旧方式（`.githooks/pre-push`でのamend）を対象に実施した1回目のレビュー記録。その後の実機検証でpre-pushフック自体が「amendしても実際にはpushされない」という致命的な設計欠陥を持つことが判明したため、この方式は撤去し`pre-commit`フレームワーク方式に再設計した。過去の記録として残す。

### レビュー対象

`git diff origin/develop...HEAD`（43 files changed, 1022 insertions(+), 313 deletions(-)）

### 指摘と対応

#### 🟡 `.githooks/pre-push`: `git commit --amend`が`backend/`以外のステージ済み変更まで巻き込む

- **内容**: `git add -A -- backend`で`backend/`配下のみをステージしても、後続の`git commit --amend --no-edit`（pathspecなし）は**インデックス全体**をコミットに含めてしまう。開発者が別コミット予定で`frontend/`等に未コミットの変更をステージしたままpushすると、意図せずbackendのコミットに混入する。
- **対応**: `git commit --amend --no-edit -- backend`とし、`git add`と同じスコープ（`backend/`のみ）に限定した。

#### 🔵 `.githooks/pre-push`: 現在の`HEAD`以外のrefをpushするケースは考慮していない

- **内容**: `git push origin featureA:featureB`のように、チェックアウト中のブランチと異なるrefをpushする場合、フックは常に`HEAD`のみをamendするため、意図した対象に反映されない。
- **判断**: 本チケットの運用は「開発者がcheckoutしているブランチをそのままpushする」通常フローのみを想定しており、このエッジケースは対応スコープ外と判断していた。

### 検討したが問題なしと判断したもの（1回目時点）

- 「amend済みコミットが既にリモートにpushされていた場合、force pushが必要になり失敗するのでは」という懸念はREFUTEDと判断していたが、実際には別の経路（フック実行前に確定した内容がpushされる）で致命的な問題が発生していた。この見落としが方式撤去の直接の原因である。
