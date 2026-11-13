# code-review 結果

`/code-review medium 333` の結果。🔴（致命的）に当たるものはなし。移植元と同じ挙動、または backend 側の不足に由来するものは「対応しない」とし、後続 Issue の候補として申し送る（目標が完璧なクローンのため）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `satisfaction-tab.tsx` | 並べ替えの `add`・`folder` を backend の feedbackRoom が受けず、エラーになる | 対応しない（移植元の画面も同じ項目を出す。backend の不足として申し送り） |
| 2 | 🟡 注意 | `satisfaction-tab.tsx` | フォルダの絞り込みを backend が無視する | 対応しない（移植元 Spring は `folderId` を受ける。backend 側の不足。申し送り） |
| 3 | 🟡 注意 | `satisfaction-tab.tsx` | フォルダ名を `/admin/indexes` の 1 ページ目から引くため、20 件を超えると `-` になる | 対応しない（移植元どおり） |
| 4 | 🔵 提案 | `accuracy-tab.tsx` | 並べ替え順の null の扱いがタブで違う | 対応しない（移植元どおり。精度タブだけ null を反映する） |
| 5 | 🟡 注意 | `count-tab.tsx` | 表示名用のユーザー管理 API が一覧と別の条件・ページで、読み込み表示も待たされる | 対応しない（移植元どおり） |
| 6 | 🔵 提案 | `use-feedback.ts` | 追加学習の成功で、操作したタブの一覧だけを読み直す | 対応しない（移植元どおり） |
| 7 | 🟡 注意 | 3 タブ | 件数が減って現在のページが範囲外になったときの補正がない | 対応しない。補正を試したが、`react-hooks/set-state-in-effect` の lint に違反するため戻した（移植元にもない）。ページ番号を query key から派生させる直し方が要り、#136 の store 方式とは別の設計になる。申し送り |
| 8 | 🔵 提案 | `use-feedback.ts` | `/admin/indexes` の応答が配列と `{ content }` の両方を読む分岐、`API_PATHS.ADMIN.LEARNING_FOLDERS` が未使用 | 対応しない（移植元の `learningFoldersQuery` と同じ分岐。`API_PATHS` は共通ファイルで、移植元の定義を写したもの） |

## 申し送り（後続 Issue の候補）

- backend: `GET /api/admin/feedbackRoom` に `folderId` を足す、`sortField` に `add`・`folder`（移植元の画面が送る）を足すか、画面側の選択肢を整理する
- 一覧の最終ページを消したあとの範囲外ページの補正（3 タブ共通）
- 絞り込み・フォルダの選択肢を件数指定なしで取っているため、20 件を超える環境で欠ける（移植元も同じ）
