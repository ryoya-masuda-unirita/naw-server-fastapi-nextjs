# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | API の型とパス定数を移植する | `frontend/src/types/**`（追加分）、`frontend/src/lib/constants/api-paths.ts` |
| 2 | API クライアントを拡張し、エラー処理・ログインキー・利用量・共通 util を移植する | `frontend/src/lib/**`、`frontend/src/hooks/**`、`frontend/src/store/auth-store*.ts`、`frontend/src/main.tsx`、`frontend/src/mocks/**`、`frontend/src/test/setup.ts` |
| 3 | 規約と docs を追加する | `frontend/.claude/CLAUDE.md`、`docs/issue-279/**` |

## 各コミットメッセージ案

```
#279 issue-279 APIの型とパス定数を移植する
    - 移植元 src/types の API の型を同じ構成で追加
    - API_PATHS に移植元の全パスと画面ごとの定数のパスをまとめる
```

```
#279 issue-279 APIクライアントを拡張し共通の処理とutilを移植する
    - PUT/PATCH/DELETE・配列クエリ・FormData・text/blob・ApiError・SSE 用の stream を追加
    - 移植元 errorInterceptor の判定と 401 でのログイン画面への遷移を追加
    - ログインキーでのログインと利用量の hooks を追加
    - 日付・入力チェック・フォームエラー・スクロール・デバウンス・タブのクエリの util を追加
    - MSW のハンドラーを機能ごとに束ねる入口とベースURLに依存しない書き方にする
```

```
#279 issue-279 API・型・MSWの規約とdocsを追加する
    - frontend の CLAUDE.md に API パス・型・api-client・MSW の置き方を追記
    - backend の応答と型の差分一覧を docs に残す
```
