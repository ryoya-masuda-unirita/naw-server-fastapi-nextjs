# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs 00〜07 を作成 | `docs/issue-277/00〜07` |
| 2 | i18n 辞書を移植元から丸ごと移植 | `frontend/public/i18n/*.json` |
| 3 | ルート定数・ガード・認証ストア・ルート定義・仮の画面 | `frontend/src/lib/constants/routes.ts`・`frontend/src/routes/**`・`frontend/src/store/auth-store*`・`frontend/src/components/layouts/not-ported.tsx` |
| 4 | レイアウト・サイドバー・アイコン・管理画面の枠 | `frontend/src/components/**`・`frontend/src/lib/constants/layout.ts`・`frontend/src/types/layout.ts`・`frontend/package*.json`・`frontend/src/main.tsx`・`frontend/index.html`・`frontend/src/index.css`・`frontend/public/icons/ranabase-icon.svg` |
| 5 | frontend の規約を更新 | `frontend/.claude/CLAUDE.md` |
| 6 | 動作確認・タスクリスト | `docs/issue-277/06・08` |

3 と 4 は相互に依存する（ルート定義がレイアウトを、サイドバーがルート定数を使う）ため、型チェックが通る単位にまとめてよい。

## 各コミットメッセージ案

```
#277 issue-277 docs 00〜07 を作成
    - 管理レイアウト・サイドバー・ガード・ルート規約の要件と設計を記載
```

```
#277 issue-277 i18n 辞書を移植元から丸ごと移植
    - ja.json・en.json を移植元の最新に置き換え
    - React 独自のテナントID入力欄のキーだけ残す
```

```
#277 issue-277 全画面のルートの枠・権限ガード・管理レイアウトとサイドバーを移植
    - ルート定数を移植元に揃え、PW リセットのパスを /auth/password/reset に変更
    - 未移植画面は担当 Issue 番号付きの仮の画面にする
    - サイドバーの通常・管理・戻るモードとユーザーメニューを移植
```

```
#277 issue-277 frontend の規約にディレクトリ構成と画面追加の手順を書く
    - Next.js 前提の記述を Vite + React Router に直す
```
