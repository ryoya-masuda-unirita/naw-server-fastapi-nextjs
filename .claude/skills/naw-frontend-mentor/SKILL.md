---
name: naw-frontend-mentor
description: Use ONLY when the user explicitly invokes /naw-frontend-mentor, or explicitly asks to be taught/mentored through porting a frontend Issue themselves (Angular secuaigent/client → React frontend/) rather than having AI implement it. The user is a React beginner; the goal is skill-building, not throughput. AI drafts docs/issue-* (00-08) and explains Angular↔React concept mappings, but does not write the implementation — it proposes small steps and reviews the user's own code, giving hints or near-answers when the user asks. Do not use for autonomous batch implementation (use naw-frontend-issue-loop) or for a single AI-implemented issue (use naw-frontend-issue-workflow).
---

# NAW Frontend Mentor

このskillは、React未経験のユーザーが `secuaigent/client`(Angular) → `frontend/`(React) への
移植Issueを**自分の手で実装しながらReactを習得する**ことを目的とする。
AIはドキュメント作成・設計提案・概念解説・コードレビューを担うが、実装コードは書かない。

## 使う場面

- ユーザーが `/naw-frontend-mentor` を叩いたとき
- 「教えながら進めて」「自分で書きたいので手伝って」等、学習目的の伴走を明示的に依頼されたとき

`naw-frontend-issue-loop`（全自動でPRまで作る）や `naw-frontend-issue-workflow`
（AIが実装を担う前提の標準手順）とは別物。**実装主体がユーザー**である点が最大の違い。

## naw-frontend-issue-workflow との違い

| 項目 | naw-frontend-issue-workflow | naw-frontend-mentor（本skill） |
|---|---|---|
| 実装の担い手 | AI | ユーザー本人 |
| AIの役割 | 実装者 | 講師・レビュアー |
| 第2承認の選択肢 | Human in the Loop / 全自動 | 常にメンター伴走モードのみ（全自動なし） |
| ゴール | Issueのクローズ（PRマージ） | Issueのクローズ＋ユーザーのReact理解 |
| ペース | タスクリスト消化を優先 | 理解確認を優先。急がない |

ドキュメント構成（`docs/issue-*/00〜08`）・ブランチ命名・Issue起票手順・コミット規約は
[naw-frontend-issue-workflow](../naw-frontend-issue-workflow/SKILL.md) と共通。
本skillでは**ドキュメント作成後の実装フェーズの進め方**のみが異なる。

## 進め方

### 0. 対象Issueの選定
`frontend-port` ラベル付きの `Todo` Issueを一覧し、ユーザーに選んでもらう
（自動選定しない。難易度感も一言添える：小さいコンポーネント/画面か、ロジックを含むか等）。

### 1. Issue着手・ドキュメント作成（00〜05）
[naw-frontend-issue-workflow](../naw-frontend-issue-workflow/SKILL.md) と同じ手順・同じテンプレート
（[doc-templates.md](../naw-issue-workflow/references/doc-templates.md)）で `00_チケット内容.md`〜
`05_テスト詳細設計.md` を作成する。ただし以下を追加する。

- `01_要件定義.md` に「この対応を通じて学ぶReact概念」の節を追加し、対象Angular実装が使っている
  仕組み（Service/DI、RxJS Observable、NgModule、テンプレートバインディング等）と、
  対応するReactの概念（カスタムHook/Context、useEffect+useState、import、JSX内条件分岐等）を
  対比表で整理する
- `03_詳細設計.md` は、ユーザーが実装時に参照する設計図として、通常よりやや詳細に
  （コンポーネント構成・props・state・使うHookまで）書く

### 2. 第1承認: 設計承認
`01_要件定義.md`・`02_基本設計.md` 完了後、必ず停止しユーザー承認を得る
（`naw-frontend-issue-workflow` と同じ）。承認前に `03_詳細設計.md` 以降へ進まない。

### 3. 第2承認は行わない（常にメンター伴走モード）
`naw-frontend-issue-workflow` の「Human in the Loop / 全自動」の選択はなく、
`03_詳細設計.md`〜`06_タスクリスト.md` 作成後、そのまま実装フェーズ（ステップ4）へ進む。

### 4. ステップ分割・実装（ユーザー主導）
`06_タスクリスト.md` を小さいステップ（例: 「まず静的なJSXを書く」→
「propsを受け取れるようにする」→「状態を持たせる」→「API連携する」）に分割する。
1ステップずつ、以下のサイクルで進める。

1. AIがそのステップで必要なReact概念をAngular実装と対比しながら解説する
2. ユーザーが自分でコードを書く
3. AIがレビューする。まずは正解を教えず、問題点と修正の方向性のヒントを示す
4. **ユーザーから「わからない」「検討がつかない」等の質問があれば、遠慮なくヒントを出し、
   必要なら答えに近い具体例やコード片も示してよい**（無理に自力解決させようとしない。
   質問された時点で「教える」フェーズに切り替える）
5. 簡単な理解確認（例:「なぜここでuseEffectを使うか説明できますか？」）を挟む
6. `06_タスクリスト.md` の該当項目を `- [x]` にチェックし、次のステップへ

### 5. 完了後
実装が固まったら `npm run test`・`npm run lint`・`npm run type-check` を実行し、
結果を `08_動作確認.md` に記録する。`07_gitコミット.md` にコミット分割案を記載するが、
**コミット・プッシュ・PR作成はユーザー自身が行う**（AIは代行しない。手順の案内のみ行う）。

## やらないこと

- ユーザーから質問される前に、実装コードを丸ごと書いて渡すこと
- 承認なしに次のステップへ進めること
- 複数Issueを自動で連続処理すること（1回のセッションで1Issueに集中する）
- ユーザーに代わってコミット・プッシュ・PR作成を行うこと
