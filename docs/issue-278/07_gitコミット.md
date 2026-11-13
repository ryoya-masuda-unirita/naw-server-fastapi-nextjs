# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 共通 UI 部品の移植・グローバル CSS・README・docs | `frontend/src/components/shared/*`、`frontend/src/index.css`、`frontend/src/main.tsx`、`frontend/src/routes/auth/*.tsx`、`frontend/public/*`、`frontend/package*.json`、`docs/issue-278/*` |

部品同士の依存（Dialog → Button、Table → Checkbox、FormSelect → Select など）が多く、途中の状態で分けても意味のある単位にならないため 1 コミットにまとめる。レビュー指摘の修正は別コミットにする。

## 各コミットメッセージ案

```
#278 issue-278 共通UI部品をReactに移植する
    - 移植元 shared/components と core/services（toast・confirm・dropdown）の部品を frontend/src/components/shared に移植
    - 移植元 styles.css を index.css に移し、フォントは main.tsx で読み込むように変更
    - ToastContainer と DropdownBackdrop をアプリのルートに配置
    - ログイン・パスワード変更のパスワード欄に表示切替を追加
    - 部品ごとの単体テストと README を追加
```
