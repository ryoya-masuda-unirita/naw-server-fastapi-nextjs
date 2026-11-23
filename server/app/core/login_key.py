"""ログインキーの発行とハッシュ化（移植元 `LoginKeyGenerator`・`LoginKeyHasher`）。"""

import hashlib
import secrets
import string

# 英数字 32 文字は約 190 ビットの乱数になり、DB にソルトなしの SHA-256 で保存しても
# 総当たりで戻せない（移植元 ADR 20261102-213224）。
LOGIN_KEY_LENGTH = 32
_ALPHANUMERIC = string.ascii_letters + string.digits


def generate_login_key() -> str:
    """ログインキーを暗号論的乱数で発行する。

    Returns
    -------
    str
        英数字（A-Z・a-z・0-9）32 文字のログインキー。
    """
    return "".join(secrets.choice(_ALPHANUMERIC) for _ in range(LOGIN_KEY_LENGTH))


def hash_login_key(login_key: str) -> str:
    """ログインキーを DB に保存・照合するためのハッシュ値にする。

    Parameters
    ----------
    login_key : str
        ログインキー（平文）。

    Returns
    -------
    str
        UTF-8 の SHA-256 を 16 進小文字 64 文字にした値。
    """
    return hashlib.sha256(login_key.encode("utf-8")).hexdigest()
