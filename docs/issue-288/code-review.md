# code-review 結果

🔴 致命的: 0 件

指摘はすべて、移植元 Angular の挙動をそのまま移したことによるもの。完璧なクローンが目的のため、コードは変えず、判断を記録する（直すなら移植元の改善提案として別途）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `routes/library/library-detail.tsx` | 本文の読み込み中、`headerOptions` が空のため一瞬「ライブラリがありません」が出る | 対応しない |
| 2 | 🟡 注意 | `store/viewer-store.ts` | 取得中にトークンが進むと `isLoading` が戻らないことがある | 対応しない |
| 3 | 🟡 注意 | `routes/feedback-preview`・`chat-shared-history` | `ChatDataPanel` に `isReadOnly` を渡さず、ビューワーの保存・PDF が使える | 対応しない |
| 4 | 🟡 注意 | `routes/chat/chat-viewer.tsx` | 非同期処理に中断がなく、連続して切り替えると古い処理が上書きしうる | 対応しない |
| 5 | 🟡 注意 | `store/viewer-store.ts` | 一覧の取得に失敗しても前のルームの選択・本文が残る | 対応しない |
| 6 | 🟡 注意 | `components/features/chat/chat-summary.tsx` | 資料が 0 件のとき、手動で開いても自動で閉じ直す | 対応しない |
| 7 | 🔵 提案 | `components/features/chat/chat-summary.tsx` | Markdown 内のどのボタンでも PDF 保存になる | 対応しない |
| 8 | 🔵 提案 | `lib/utils/print-html-content.ts` | 完全な HTML を `documentElement.innerHTML` に入れている・300ms 固定で待つ | 対応しない |
| 9 | 🔵 提案 | `components/features/chat/chat-data-panel.tsx` | 一覧の読み込みの担当が分かれ、同じ一覧を重ねて取る場合がある | 対応しない |
| 10 | 🟡 注意 | `components/features/chat/chat-save-library-dialog.tsx` | 保存すると既存のタグ・チームが空で上書きされる | 対応しない |

## 詳細

### 1. 読み込み中に「ライブラリがありません」（🟡）→ 対応しない

移植元 `LibraryDetailComponent` も `headerOptions` を `showLibrary` の完了後に設定し、`ChatSummary` の `isViewerEmpty` は `headerOptions` の件数で決まるため同じ表示になる。

### 2. `isLoading` が戻らない（🟡）→ 対応しない

移植元 `ViewerService.loadContent` の `finally` も、トークンが同じときだけ `isLoading` を戻す。古い取得の `finally` で戻すと、後から始まった取得の表示を消すため、直すなら取得ごとの ID を別に持つ必要がある。移植元の改善提案として別途。

### 3. 閲覧専用画面のビューワー（🟡）→ 対応しない

移植元の `feedback-preview`・`chat-shared-history` のテンプレートも `<app-chat-data-panel [roomId]>` だけで `isReadOnly` を渡さない。ライブラリの保存は API 側の権限チェックに任せる。共有閲覧（`chat-shared`）は移植元どおり渡している。

### 4. chat-viewer の中断（🟡）→ 対応しない

移植元 `ngOnInit` も同じ流れ（中断なし）。`chatId` が無いとき `''` で読むのも同じ。ページを開いたあとに URL だけが変わることは通常なく、影響は小さい。

### 5. 一覧の取得失敗時の選択（🟡）→ 対応しない

移植元 `loadList` も失敗時は `viewers` と `listLoadError` だけを更新する。エラー表示中は本文を出さず、メニューの「ライブラリに保存」も `isReadOnly` 以外では出るが、移植元と同じ。

### 6. 自動で閉じ直す（🟡）→ 対応しない

移植元の effect も同じ条件（一覧が空・取得済み）で閉じる。資料が 0 件のルームでは開く意味がないため、実害は小さい。

### 7. Markdown 内のボタン（🔵）→ 対応しない

移植元の `onMarkdownContentClick` と同じ（モックの HTML にあった「ダウンロード」ボタンを PDF 保存にする仕組み）。`MarkdownView` は DOMPurify で無害化するが `button` は残る。

### 8. 印刷ウィンドウ（🔵）→ 対応しない

移植元と同じ書き方・待ち時間。タイトルのエスケープだけ、移植元から変えた（利用者入力のため）。

### 9. 一覧の読み込みの担当（🔵）→ 対応しない

移植元も `ChatDataPanel` の effect が読み、ビューワーだけのページは自分で読む。`listRequestToken` で古い応答は捨てている。

### 10. 保存でタグ・チームが空になる（🟡）→ 対応しない

移植元のダイアログも `selectedTagIds`・`selectedTeamIds` を空で始め、そのまま `updateLibraryMetadata` に渡す。完璧なクローンのため同じにした。直すなら移植元の改善提案として別途（既存のタグ・チームを読み込んで初期値にする）。
