# code-review 結果

PR #306 に `/code-review` を実行した結果（指摘 10 件）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `frontend/src/components/layouts/admin-layout.tsx` | モバイルでサイドバーを開くボタンを消したため、#278 のページヘッダーが入るまでモバイルでナビ・ログアウトに届かない（develop からの退行） | 対応済み |
| 2 | 🔴 致命的 | `frontend/src/components/layouts/sidebar.tsx` | グループ管理者だけのユーザーをグループ一覧へ移す effect が `RequireTenantAdmin` と二重に遷移し、履歴に元の URL が残って「戻る」で行き来する | 対応済み |
| 3 | 🔴 致命的 | `frontend/src/components/layouts/sidebar/user-menu.tsx` | メニューの外クリック用の `fixed inset-0` の backdrop が transform を持つ aside の中にあり、サイドバーの範囲しか覆わない。本文をクリックしてもメニューが閉じない | 対応済み |
| 4 | 🟡 注意 | `frontend/src/components/layouts/admin-layout.tsx` | `<main>` が `overflow-hidden` で、`term-main` のスタイルもまだないため長い画面がスクロールできない | 対応しない |
| 5 | 🟡 注意 | `frontend/src/store/auth-store.ts` | 保存済みのグループを、セッションのユーザーと同じか確かめずに引き継ぐ | 対応済み |
| 6 | 🟡 注意 | `frontend/src/components/layouts/sidebar.tsx` | 「初回描画か」の ref だと StrictMode の effect 二重実行で初回にも遷移時の処理（キャッシュ無効化）が走る | 対応済み |
| 7 | 🔵 提案 | `frontend/src/components/layouts/sidebar.tsx` | アクション項目を labelKey で分岐し、`route` が `#` 以外の項目をリンクにしていない | 一部対応 |
| 8 | 🟡 注意 | `frontend/src/components/layouts/sidebar.tsx` | `window.open(url, '_blank')` に `noopener` がない（逆タブナビング） | 対応済み |
| 9 | 🔵 提案 | `frontend/src/components/layouts/not-ported.tsx` | 「close」「未移植: …」「User Avatar」が i18n を通していない | 一部対応 |
| 10 | 🔵 提案 | `frontend/src/components/layouts/sidebar.tsx` | ストアをセレクターなしで読んでいる。`LayoutConfig` に誰も読まない項目（`libraryRoute` 等）がある | 一部対応 |

## 詳細

### 1. モバイルでサイドバーを開けない（🔴 致命的）→ 対応済み

移植元ではページヘッダー（page-header）のボタンで開くため、クローン方針で React 独自の浮きボタンを消していたが、page-header は #278 の担当で、入るまでモバイルからナビ・ログアウトに届かなくなる。`AdminLayout` に仮のボタンとして戻し、「#278 の PageHeader に開閉ボタンが入ったら消す」とコメントを付けた。テストを追加。

### 2. グループ管理者だけのユーザーのリダイレクトが二重になる（🔴 致命的）→ 対応済み

移植元の `checkAdminRoute` は `NavigationEnd` で動くが、移植元ではテナント管理者用の画面はすべて `tenantAdminGuard` が先に遷移を変えるため、この処理に届くことがない（`/admin/management` もルートがなく `**` で `/dashboard` になる）。React ではガードと同時に動いて履歴を壊すため、effect を削除しガードに任せた。対応するテストも削除。

### 3. ユーザーメニューが本文のクリックで閉じない（🔴 致命的）→ 対応済み

backdrop をやめ、メニューが開いている間だけ `document` の `mousedown` でメニューの外のクリックを拾って閉じる形にした。テストを `document.body` のクリックで閉じることの確認に変更。

### 4. メイン領域がスクロールしない（🟡 注意）→ 対応しない

移植元も `<main class="flex-1 overflow-hidden">` で、スクロールは各画面の `term-main`（`overflow-y: auto`）が持つ。`term-main` を含む移植元 `styles.css` のクラスは #278 で `index.css` に移す担当のため、ここで定義すると #278 と衝突する。現在の仮の画面は 1 行で、スクロールは不要。PR 本文と `08_動作確認.md` の未確認事項に記載した。

### 5. 他人のグループを引き継ぐおそれ（🟡 注意）→ 対応済み

移植元はユーザーを比べないが、別タブで別ユーザーにログインし直した場合に UI 上の権限が他人のものになるのを防ぐため、`storedUser.id === user.id` のときだけ引き継ぐようにした（API 側の権限チェックは backend が行うため、UI の出し分けだけの問題）。テストを追加。

### 6. StrictMode で初回にもキャッシュ無効化が走る（🟡 注意）→ 対応済み

「初回か」のフラグをやめ、前回の pathname と比べて変わったときだけ動かすようにした。StrictMode で包んだ初回描画で無効化しないテストを追加。

### 7. アクション項目の分岐（🔵 提案）→ 一部対応

`route` が `#` 以外の項目をリンク（`NavLink`）で描画する分岐を移植元どおり足した。ダイアログを labelKey で選ぶのは移植元（`onActionItemClick`）と同じのため、そのままにした。

### 8. `window.open` に noopener がない（🟡 注意）→ 対応済み

移植元は付けていないが、挙動は変わらず安全側のため `'noopener,noreferrer'` を付けた。

### 9. 文言のハードコード（🔵 提案）→ 一部対応

仮のダイアログの閉じるボタンは `COMMON.CLOSE` を使うようにした。「未移植: …」は製品の文言ではなく、全画面の移植で消える開発用の目印のため i18n 辞書（移植元のクローン）に入れない（`03_詳細設計.md` に記載済み）。アバターの `alt="User Avatar"` は移植元のテンプレートと同じハードコードのため揃えた。

### 10. セレクター・未使用の設定項目（🔵 提案）→ 一部対応

誰も読まない `libraryRoute`（移植元でも未使用の `backToLibraryList` でだけ使う）を削除した。`chatRoomRoute` はルーム一覧（#285）で使うため型にコメントを付けて残した。ストアのセレクターは、サイドバーが読む値がストアのほぼ全項目で効果が小さいため見送った。
