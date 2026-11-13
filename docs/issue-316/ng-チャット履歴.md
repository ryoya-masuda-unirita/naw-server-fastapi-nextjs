# NG: 16_チャット履歴

25 項目のうち OK 24・NG 1。NG の 1 件は **React が移植元と違う本当の差**（テストの誤りではない）。原因は、学習データ（17-15）と同じ共有部品 1 つ。

| 原因 | 項番 | 修正の対象 |
|---|---|---|
| 期間フィルターの「期間を指定」で、カレンダーの日を押すと期間フィルターごと閉じてしまい、期間を指定できない | 16-23（学習データの 17-15 も同じ） | `frontend/src/components/shared/period-filter.tsx` |

確認の方法: 移植元のコード（`~/Documents/unirita-develop-pj/secuaigent-ref/client`）と項目書で期待を確かめ、実際の画面の挙動（Playwright での操作と、調査用に流した操作の aria snapshot）と React のコードで原因を特定した。

## [16-23] 期間指定0件

- 項目書の期待: 該当データのない期間を指定すると、0 件または空状態になる
- 移植元の挙動: `client/src/app/features/admin/management/chat-history/components/chat-history-filter/chat-history-filter.component.html` が共有部品 `<app-period-filter>`（`allowCustom` の既定は `true`）を使う。「期間を指定」を選び、開始日・終了日の入力欄を押してカレンダーから日を選び、「決定」を押すと期間で絞り込める
- React の挙動: 期間フィルターを開き、「期間を指定」→ 開始日の入力欄 → カレンダーの日を押すと、**期間フィルターのパネルごと閉じる**。開始日の入力欄が消えるので、終了日も「決定」も押せず、期間を指定できない（テストの失敗: 開始日を選んだあと `admin-chat-history-period-from-input` が見つからない）
- 原因: `period-filter.tsx` の「部品の外を押したら閉じる」処理（`document` の `click` リスナー。153〜163 行目付近）が、`event.target` が部品の中にあるかを `hostRef.current.contains(event.target)` で調べている。カレンダーの日を押すと、React の `onClick` が `setView('range')` を呼び、**イベントが `document` に届く前に** 日のボタンを含むカレンダー画面が DOM から外れる（React は離散イベントの更新をイベントの途中で反映する）。`document` のリスナーが動く時点で `event.target` は DOM から外れており、`contains` が `false` になって「外を押した」と判断され、`setIsOpen(false)` で閉じる。移植元の Angular は変更検知がイベントの処理後に走るため、`document` のリスナーの時点では日のボタンがまだ DOM にあり、閉じない。jsdom の単体テスト（`period-filter.test.tsx`）は `fireEvent` でこの順序を再現できず、通っている
- 修正の方針: 判定を、DOM から外れても変わらないものにする。例: `event.composedPath().includes(hostRef.current)`（`composedPath()` はイベントの発火時点の経路を返す）。または、判定を `mousedown` に変える
- 影響範囲: 共有部品なので、「期間を指定」を使うすべての画面（チャット履歴・学習データの詳細。ほかに `PeriodFilter` を使う画面があれば同じ）で期間指定が使えない。「今日」「過去 7 日間」「過去 30 日間」は動く（16-07〜16-09 は OK）

## テストの誤りだったもの

なし。ただし、書き方を直した点がある（NG ではない）:

- 16-23 の期間指定は、日を選んだ直後に「入力欄に日付が入る」を確かめる（`chooseCustomPeriod`）。パネルが閉じたら、30 秒待たずに原因が分かる形で失敗する
- 並べ替え・検索の確認は、並列で他のテストが同じテナントにチャットを作っても影響されないよう、テストごとの接頭辞（`d-xxxxxxxx`）で検索して絞り込んでから行う

## 項目書の項番としては OK だが、気づいたこと

- 件数表示は「1-20件 / 57件」の形（移植元の `CHAT_HISTORY.PAGE_COUNT` と同じ）。項目書の「○件中○〜○件」とは文言が違うが、移植元の画面と同じ
