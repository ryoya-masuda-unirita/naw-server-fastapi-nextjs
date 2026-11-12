# code-review 結果

対象: PR #211（`/code-review 211` を実行）

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `frontend-angular/.../pw-reset.component.ts` | 画面は `err.error?.message` を表示するが backend は `detail` で返すため、ポリシー違反のメッセージが画面に出ない | 対応しない（スコープ外） |
| 2 | 🟡 注意 | `backend/app/core/password_policy.py` | 記号必須で使用可能な記号が空のテナントでは、初期パスワードは記号なしで生成されるのに、再設定は必ず失敗する | 対応しない（移植元と同じ挙動） |
| 3 | 🔵 提案 | `backend/app/core/password_policy.py` | 文字数・文字種の判定が Java（UTF-16 単位）と異なり、絵文字など補助面の文字で結果がずれる | 対応しない |
| 4 | 🔵 提案 | `backend/app/core/password_policy.py` | `str.strip()` は NBSP なども空白とみなし、Java の `isBlank()` と完全には一致しない | 対応しない |
| 5 | 🟡 注意 | `backend/app/services/user_import_listener.py` | CSV インポートのパスワードはポリシー検証されない | 対応しない（移植元と同じ・スコープ外） |
| 6 | 🔵 提案 | `backend/app/core/password_policy.py` | 同じ再設定フロー内で、履歴重複エラーだけ英語のまま。`_policy_error` も使っていない | 対応済み |
| 7 | 🟡 注意 | `backend/app/services/user_service.py` | プロフィール更新にも複雑性チェックが効くようになり、移植元より厳しくなる | 対応しない（設計で受け入れ済み） |
| 8 | 🔵 提案 | `backend/tests/unit/test_password_policy.py` | エラーメッセージが本体とテストの両方にリテラルで書かれている | 対応しない |
| 9 | 🔵 提案 | `backend/tests/unit/test_password_policy.py` | ケース生成のループ変数がモジュールの名前空間に残る | 対応済み |

🔴 致命的: 0 件

## 詳細

### 1. 画面にメッセージが表示されない（🟡 注意）→ 対応しない（スコープ外）

移植先 backend のエラーレスポンスは全 API で `{"detail": ...}`、移植元は `{"message": ...}` で、これは全 API 共通の既存差分である。本 Issue だけで形式を変えると他 API と食い違うため、`01_要件定義.md` のスコープ外に明記した。frontend-angular は変更しない方針。パスワードは 400 で正しく拒否されており、ポリシーを守らせるという本 Issue の目的は達成している。

### 2. 記号必須なのに使用可能な記号が空のテナント（🟡 注意）→ 対応しない（移植元と同じ挙動）

移植元でも、`PasswordGenerator` は記号一覧が空なら記号を入れずに初期パスワードを作り（`isPwPolicyUseSymbols() && !symbols.isEmpty()`）、`PasswordPolicy.validate` は「新パスワードの記号要件を満たせません。」で拒否する。つまり同じ挙動である。この組み合わせはテナント設定の誤りなので、本来はテナント設定側で防ぐべきもので、検証側で緩めると移植元と食い違う。

### 3. UTF-16 単位との差（🔵 提案）→ 対応しない

差が出るのは、絵文字や数学用英字など補助面の文字を含むパスワードに限られる。Python の文字（コードポイント）単位の判定の方が利用者の感覚に合う。わざわざ UTF-16 に変換して Java の挙動を再現するほどの価値はない。

### 4. `strip()` と `isBlank()` の差（🔵 提案）→ 対応しない

差が出るのは、NBSP（U+00A0）など特殊な空白だけでできたパスワードに限られる。移植先はそれを「空白のみ」として拒否する、より安全側の挙動になるため、そのままにする。

### 5. CSV インポートの未検証（🟡 注意）→ 対応しない

移植元の `UserService.createOrUpdateUserFromImport` もポリシー検証をせずにパスワードを保存しており、取り込んだユーザーは `isRequiredPasswordReset=true` で初回に再設定が必要になる。本 Issue は利用者が設定する新パスワードの検証が対象で、インポートは範囲外。

### 6. 履歴重複エラーだけ英語（🔵 提案）→ 対応済み

`check_password_not_reused` のメッセージを、移植元 `PasswordResetService.SAME_PASSWORD_MESSAGE` と同じ「新パスワードは過去のパスワードと異なるものを設定してください。」にし、`_policy_error` で例外を作るようにした。`tests/unit/test_auth_service.py` の履歴重複テストでメッセージも確認するようにした。

### 7. プロフィール更新の厳格化（🟡 注意）→ 対応しない

`01_要件定義.md`「影響」で受け入れ済みである。移植先は以前から同じ関数で最小文字数を検証しており、テナントのポリシーを確実に守らせるため共用を維持する。メッセージの「新パスワード」という表現は、プロフィール画面で新しいパスワードを入力する場面でも意味が通るため、そのままとした。

### 8. メッセージがテストにもリテラルで書かれている（🔵 提案）→ 対応しない

テストは「移植元と同じ文言が返ること」という仕様を確かめるもので、期待値をリテラルで持つ方が本体の文言の意図しない変更を検知できる。本体の定数を import すると、本体を変えたときにテストも一緒に変わってしまい、検知できなくなる。

### 9. ループ変数がモジュールに残る（🔵 提案）→ 対応済み

ケース生成を `_missing_type_cases()` 関数に移し、`MISSING_TYPE_CASES = _missing_type_cases()` とした。

## 再テスト

`origin/develop`（#167 の PR #202 マージ済み）をマージして衝突を解消した後の結果:

```
$ uv run pytest tests/integration/test_auth.py tests/unit/test_auth_schemas.py tests/unit/test_password_policy.py -q -p no:warnings
89 passed in 8.90s
$ uv run pytest -q -p no:warnings
906 passed in 44.75s
```
