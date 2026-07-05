# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/core/security.py:104` | Cookieが期限切れ・不正な場合、有効なAuthorizationヘッダーへのフォールバックが働かない | 対応しない |

## 詳細

### 1. Cookieが不正な場合にAuthorizationヘッダーへフォールバックしない（🟡 注意）→ 対応しない

`get_current_user` の `token = access_token or (credentials.credentials if credentials else None)` は、Cookieが「存在しない」場合のみAuthorizationヘッダーにフォールバックする。Cookieが「存在するが期限切れ・不正」な場合は、有効なAuthorizationヘッダーが同時に送られていてもフォールバックされず401になる。

多角的レビュー（8種のfinderエージェント）で複数回指摘され、検証の結果「メカニズムとしては事実だが、現状このリポジトリ内にCookieとAuthorizationヘッダーを同一リクエストで併用するクライアントは存在しない（`frontend-angular`はCookieのみ、既存テストもいずれか片方のみを使用）」ことを確認した（PLAUSIBLE判定）。

対応しない理由:
- 今回のスコープは「移植元Cookieセッション方式への対応」であり、Cookie・ヘッダー併用という現状発生し得ないシナリオへの対応は仮説的な将来要件にあたる
- 対応する場合、複数トークン候補を順に試行するロジックが必要になり、現状発生しない edge case のために `get_current_user` の複雑度を上げることになる
- 該当エンドポイントに対して、現状のクライアント（`frontend-angular`・既存テスト）はいずれも単一の認証手段のみを使用しており、実害はない

なお、レビューで併せて検証された以下2件は誤検知（REFUTED）と判定した。

- `clear_access_token_cookie` が `secure`/`samesite` 属性を `set_access_token_cookie` と揃えていない件: RFC 6265bis の「Secure Cookieは安全な接続経由でのみ上書き・削除できる」という規則により、ログアウトリクエスト自体が（Secure Cookieが送信された時点で）HTTPS経由であることが保証されるため、`delete_cookie` 側の `secure=`引数の値に関わらず削除は成功する。実害なしと判断。
- `HTTPBearer(auto_error=False)` への変更によるステータスコード変化（403→401への変化）の懸念: 実際にインストールされているfastapiバージョン（0.138.1）では、`auto_error=True`時点でも不正なAuthorizationヘッダーに対して常に401を返す実装になっており、変更前後でステータスコードの差異は発生しない。
