# code-review 結果

差分を自分でレビューした（`code-review` スキルは使わず、移植元の `login.component.ts`・`form-errors.ts` と突き合わせた）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `frontend/src/routes/auth/login.tsx` | 移植元はログイン失敗の文言をユーザーID欄の下とトーストに出すが、React は上部の帯のまま | 対応しない |
| 2 | 🔵 提案 | `frontend/src/lib/utils/auth-validation.ts` | 空白のみのパスワードは必須エラーにならない | 対応しない |

🔴 致命的は 0 件。

## 詳細

### 1. ログイン失敗の表示位置（🟡）→ 対応しない

本 Issue は入力チェックのみが範囲。失敗時の表示は別の差分として扱う（E2E 03 の項番では NG になっていない）。

### 2. 空白のみのパスワード（🔵）→ 対応しない

Angular の `Validators.required` と同じ判定（空文字だけを未入力とする）に揃えるための仕様。
