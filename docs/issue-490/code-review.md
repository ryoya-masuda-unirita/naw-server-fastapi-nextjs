# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `client/src/components/shared/form-switch.tsx` | `switchLabel` がないとき、`Switch` が `label` を可視テキストとしても描くため、ラベルが二重に表示される | 対応済み |
| 2 | 🔵 提案 | `client/src/components/shared/context-menu.tsx` | 行のメニューのトリガーが、すべて同じ名前「メニューを開く」になる | 対応しない |
| 3 | 🔵 提案 | `client/src/components/shared/form-sort-input.tsx` | モバイルのドロワーの 2 つの `menu` に名前がない | 対応しない |

## 詳細

### 1. ラベルの二重表示（🟡 注意）→ 対応済み

`Switch` に、見た目に出さず名前だけを付ける `ariaLabel` を足し、`FormSwitch` は `label` をこちらに渡すようにした。`switchLabel` があるときの挙動（可視テキストと名前が `switchLabel`）は変えない。ラベルが 1 回しか出ないことのテストを足した。

### 2. トリガーの名前が行ごとに区別できない（🔵 提案）→ 対応しない

この Issue は axe の違反（名前がない）を直すもの。`triggerLabel` は呼び出し側から行ごとの名前を渡せるように足してあるが、8 か所の行ごとの名前（ユーザー名・タイトルなど）の翻訳の設計は、見た目・読み上げの方針に関わるため、別の Issue で扱う。

### 3. ドロワーの `menu` に名前がない（🔵 提案）→ 対応しない

`role="menu"` は axe の `aria-required-parent` を満たすために付けた（実画面の axe で確認）。名前の付け方（項目・並び順のラベルの翻訳）は、行メニューの名前と合わせて別の Issue で扱う。
