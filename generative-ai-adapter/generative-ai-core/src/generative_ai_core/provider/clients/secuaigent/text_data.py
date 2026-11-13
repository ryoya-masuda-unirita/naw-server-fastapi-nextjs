"""SecuAiGent の textData JSON の厳密な読み込み（移植元 CoreSecuAiGentTextDataLoader・
CoreSecuAiGentTextDataDocument・CoreSecuAiGentTextDataFailure）。

不正な入力はすべて同じ固定メッセージの失敗にする（パス・値を出さない）。
"""

import json
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from generative_ai_core.chat.models import CoreChatTool, CoreChatToolKind

CODE = "SECUAIGENT_TEXTDATA_INVALID"
CATEGORY = "CONFIGURATION"
SAFE_MESSAGE = (
    f"{CODE}: textData JSON file could not be used. Check the file path, JSON syntax, "
    "and allowed keys."
)
ROOT_KEYS = frozenset(
    {
        "credential",
        "accessToken",
        "deployName",
        "messageId",
        "additionalPrompt",
        "temperature",
        "maxTokens",
        "reasoning_effort",
        "verbosity",
        "createLibrary",
        "streamfilepath",
        "tools",
    }
)
CREDENTIAL_KEYS = frozenset({"url", "tenantId"})
WEB_SEARCH_KEYS = frozenset({"name"})
MCP_KEYS = frozenset(
    {
        "name",
        "server_label",
        "server_url",
        "require_approval",
        "authorization",
        "headers",
    }
)
TOOLS_ONLY_KEYS = frozenset({"tools"})
MAX_INT = 2**31 - 1
BEARER = "bearer"
BEARER_LENGTH = len(BEARER)
MAX_TEMPERATURE = Decimal(1)


class CoreSecuAiGentTextDataFailure(ValueError):
    """移植元では IllegalArgumentException。"""

    code = CODE
    category = CATEGORY

    def __init__(self) -> None:
        """固定メッセージで失敗を作る。"""
        super().__init__(SAFE_MESSAGE)

    @property
    def safe_message(self) -> str:
        """パス・値を含まない固定メッセージを返す。

        Returns
        -------
        str
            固定メッセージ。
        """
        return SAFE_MESSAGE


@dataclass(frozen=True)
class CoreSecuAiGentTextDataDocument:
    """読み込んだ textData の内容。"""

    # repr（ログ・例外）に値を出さない（移植元 toString は有無だけを出す）
    url: str | None = field(default=None, repr=False)
    access_token: str | None = field(default=None, repr=False)
    tenant_id: str | None = field(default=None, repr=False)
    stream_file_path: str | None = field(default=None, repr=False)
    deploy_name: str | None = None
    message_id: str | None = None
    additional_prompt: str | None = field(default=None, repr=False)
    temperature: float | None = None
    max_tokens: int | None = None
    reasoning_effort: str | None = None
    verbosity: str | None = None
    create_library: bool | None = None
    tools: tuple[CoreChatTool, ...] = field(default=(), repr=False)
    tools_specified: bool = False

    @classmethod
    def empty(cls) -> "CoreSecuAiGentTextDataDocument":
        """何も指定されていない文書を返す。

        Returns
        -------
        CoreSecuAiGentTextDataDocument
            すべて未指定の文書。
        """
        return cls()


def _invalid() -> CoreSecuAiGentTextDataFailure:
    """固定メッセージの失敗を作る。

    Returns
    -------
    CoreSecuAiGentTextDataFailure
        textData の失敗。
    """
    return CoreSecuAiGentTextDataFailure()


def _reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """JSON のキーの重複を拒否して辞書にする。

    Parameters
    ----------
    pairs : list[tuple[str, Any]]
        キーと値の組の列。

    Returns
    -------
    dict[str, Any]
        キーの重複のない辞書。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        キーが重複したとき。
    """
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _invalid()
        result[key] = value
    return result


def _reject_constant(value: str) -> Any:
    """NaN・Infinity を拒否する。

    Parameters
    ----------
    value : str
        JSON の定数の表記。

    Returns
    -------
    Any
        返らない（常に例外）。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        常に送出する。
    """
    # NaN・Infinity は厳密な JSON ではない
    raise _invalid()


def _read(file_path: str) -> Any:
    """ファイルを厳密な JSON として読む。

    Parameters
    ----------
    file_path : str
        textData のファイルパス。

    Returns
    -------
    Any
        読み込んだ JSON の値（数値は Decimal）。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        読めない・JSON が不正なとき。
    """
    try:
        text = Path(file_path).read_text(encoding="utf-8")
        return json.loads(
            text,
            object_pairs_hook=_reject_duplicates,
            parse_int=Decimal,
            parse_float=Decimal,
            parse_constant=_reject_constant,
        )
    except CoreSecuAiGentTextDataFailure:
        raise
    except (OSError, ValueError) as e:
        raise _invalid() from e


def _is_control(text: str) -> bool:
    """移植元 Character.isISOControl（U+0000〜U+001F・U+007F〜U+009F）。

    Parameters
    ----------
    text : str
        調べる文字列。

    Returns
    -------
    bool
        制御文字を含むなら True。
    """
    return any(ord(ch) <= 0x1F or 0x7F <= ord(ch) <= 0x9F for ch in text)


def _is_blank(text: str) -> bool:
    """文字列が空または空白だけか判定する。

    Parameters
    ----------
    text : str
        調べる文字列。

    Returns
    -------
    bool
        空白だけなら True。
    """
    return not text.strip()


def _validate_keys(value: dict[str, Any], allowed: frozenset[str]) -> None:
    """許可されていないキーがないか確かめる。

    Parameters
    ----------
    value : dict[str, Any]
        調べる JSON オブジェクト。
    allowed : frozenset[str]
        許可するキーの集合。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        許可外のキーがあるとき。
    """
    if any(key not in allowed for key in value):
        raise _invalid()


def _object(root: dict[str, Any], key: str) -> dict[str, Any] | None:
    """キーの値を JSON オブジェクトとして取り出す。

    Parameters
    ----------
    root : dict[str, Any]
        親の JSON オブジェクト。
    key : str
        取り出すキー。

    Returns
    -------
    dict[str, Any] | None
        オブジェクト。キーがなければ None。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        値がオブジェクトでないとき。
    """
    value = root.get(key)
    if value is None:
        return None
    if not isinstance(value, dict):
        raise _invalid()
    return value


def _string(root: dict[str, Any], key: str, nonblank: bool) -> str | None:
    """キーの値を文字列として取り出す。

    Parameters
    ----------
    root : dict[str, Any]
        親の JSON オブジェクト。
    key : str
        取り出すキー。
    nonblank : bool
        True なら空白だけの文字列を拒否する。

    Returns
    -------
    str | None
        文字列。キーがなければ None。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        文字列でない・空白だけ（nonblank 時）のとき。
    """
    value = root.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise _invalid()
    if nonblank and _is_blank(value):
        raise _invalid()
    return value


def _stream_path(root: dict[str, Any], key: str) -> str | None:
    """ストリームファイルのパスを取り出す。

    Parameters
    ----------
    root : dict[str, Any]
        親の JSON オブジェクト。
    key : str
        取り出すキー。

    Returns
    -------
    str | None
        パス。未指定・空白だけなら None。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        文字列でない・制御文字を含むとき。
    """
    value = _string(root, key, False)
    if value is None or _is_blank(value):
        return None
    if _is_control(value):
        raise _invalid()
    return value


def _decimal(root: dict[str, Any], key: str) -> float | None:
    """キーの値を 0 以上 1 以下の小数として取り出す。

    Parameters
    ----------
    root : dict[str, Any]
        親の JSON オブジェクト。
    key : str
        取り出すキー。

    Returns
    -------
    float | None
        小数。キーがなければ None。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        数値でない・範囲外のとき。
    """
    value = root.get(key)
    if value is None:
        return None
    if not isinstance(value, Decimal):
        raise _invalid()
    if value < 0 or value > MAX_TEMPERATURE:
        raise _invalid()
    return float(value)


def _integer(root: dict[str, Any], key: str) -> int | None:
    """キーの値を 1 以上 int の最大値以下の整数として取り出す。

    Parameters
    ----------
    root : dict[str, Any]
        親の JSON オブジェクト。
    key : str
        取り出すキー。

    Returns
    -------
    int | None
        整数。キーがなければ None。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        整数でない・範囲外のとき。
    """
    value = root.get(key)
    if value is None:
        return None
    if not isinstance(value, Decimal):
        raise _invalid()
    try:
        if value % 1 != 0 or value <= 0 or value > MAX_INT:
            raise _invalid()
    except InvalidOperation as e:
        raise _invalid() from e
    return int(value)


def _bool(root: dict[str, Any], key: str) -> bool | None:
    """キーの値を真偽値として取り出す。

    Parameters
    ----------
    root : dict[str, Any]
        親の JSON オブジェクト。
    key : str
        取り出すキー。

    Returns
    -------
    bool | None
        真偽値。キーがなければ None。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        真偽値でないとき。
    """
    value = root.get(key)
    if value is None:
        return None
    if not isinstance(value, bool):
        raise _invalid()
    return value


def has_bearer_scheme(text: str) -> bool:
    """先頭が `Bearer ` で始まるか判定する（大文字小文字は問わない）。

    Parameters
    ----------
    text : str
        調べる文字列。

    Returns
    -------
    bool
        `Bearer` の後に空白が続けば True。
    """
    token = text.lstrip()
    return (
        len(token) > BEARER_LENGTH
        and token[:BEARER_LENGTH].lower() == BEARER
        and token[BEARER_LENGTH].isspace()
    )


def _safe_required(value: dict[str, Any], key: str) -> str:
    """必須の文字列を取り出す。制御文字は拒否する。

    Parameters
    ----------
    value : dict[str, Any]
        親の JSON オブジェクト。
    key : str
        取り出すキー。

    Returns
    -------
    str
        文字列。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        なし・空白だけ・制御文字を含むとき。
    """
    text = _string(value, key, True)
    if text is None or _is_control(text):
        raise _invalid()
    return text


def _headers(tool: dict[str, Any]) -> dict[str, str]:
    """ツールのヘッダーを検証して取り出す。

    Parameters
    ----------
    tool : dict[str, Any]
        ツールの JSON オブジェクト。

    Returns
    -------
    dict[str, str]
        ヘッダー名と値の辞書（なければ空）。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        ヘッダーが不正なとき。
    """
    raw = tool.get("headers")
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise _invalid()
    result: dict[str, str] = {}
    lowered_names: set[str] = set()
    for name, value in raw.items():
        canonical = name.strip()
        if (
            not canonical
            or _is_control(name)
            or canonical.lower() == "authorization"
            or canonical.lower() in lowered_names
        ):
            raise _invalid()
        lowered_names.add(canonical.lower())
        if not isinstance(value, str) or _is_blank(value) or _is_control(value):
            raise _invalid()
        result[canonical] = value
    return result


def _tool(value: dict[str, Any]) -> CoreChatTool:
    """ツール 1 件を検証して core のツールにする。

    Parameters
    ----------
    value : dict[str, Any]
        ツールの JSON オブジェクト。

    Returns
    -------
    CoreChatTool
        core のツール。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        ツールが不正なとき。
    """
    name = _string(value, "name", True)
    if name is None:
        raise _invalid()
    if name == "web_search":
        _validate_keys(value, WEB_SEARCH_KEYS)
        return CoreChatTool.web_search()
    if name != "mcp":
        raise _invalid()
    _validate_keys(value, MCP_KEYS)
    label = _safe_required(value, "server_label")
    url = _safe_required(value, "server_url")
    approval = _string(value, "require_approval", True)
    if approval is not None and approval != "never":
        raise _invalid()
    authorization = _string(value, "authorization", True)
    if authorization is not None and (
        _is_control(authorization) or has_bearer_scheme(authorization)
    ):
        raise _invalid()
    return CoreChatTool.mcp(label, url, "never", authorization, _headers(value))


def _tools(root: dict[str, Any]) -> tuple[CoreChatTool, ...]:
    """tools を検証して重複を除いた列にする。

    Parameters
    ----------
    root : dict[str, Any]
        textData の JSON オブジェクト。

    Returns
    -------
    tuple[CoreChatTool, ...]
        ツールの列（tools がなければ空）。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        不正・同名で内容が違うとき。
    """
    if "tools" not in root:
        return ()
    value = root["tools"]
    if not isinstance(value, list):
        raise _invalid()
    unique: dict[str, CoreChatTool] = {}
    for item in value:
        if not isinstance(item, dict):
            raise _invalid()
        tool = _tool(item)
        if tool.kind == CoreChatToolKind.WEB_SEARCH:
            identity = "web_search"
        elif tool.server_label is not None:
            identity = f"mcp:{tool.server_label}"
        else:
            raise _invalid()
        previous = unique.setdefault(identity, tool)
        if previous != tool:
            raise _invalid()
    return tuple(unique.values())


class CoreSecuAiGentTextDataLoader:
    """textData JSON を読み込む。"""

    def load(self, file_path: str | None) -> CoreSecuAiGentTextDataDocument:
        """textData JSON を読み込んで文書にする。

        Parameters
        ----------
        file_path : str | None
            textData のファイルパス。未指定・空白なら空の文書。

        Returns
        -------
        CoreSecuAiGentTextDataDocument
            読み込んだ文書。

        Raises
        ------
        CoreSecuAiGentTextDataFailure
            読めない・内容が不正なとき。
        """
        if file_path is None or _is_blank(file_path):
            return CoreSecuAiGentTextDataDocument.empty()
        root = _read(file_path)
        if not isinstance(root, dict):
            raise _invalid()
        _validate_keys(root, ROOT_KEYS)
        credential = _object(root, "credential")
        if credential is not None:
            _validate_keys(credential, CREDENTIAL_KEYS)
        token = _string(root, "accessToken", True)
        if token is not None and has_bearer_scheme(token):
            raise _invalid()
        return CoreSecuAiGentTextDataDocument(
            url=None if credential is None else _string(credential, "url", True),
            access_token=token,
            tenant_id=None
            if credential is None
            else _string(credential, "tenantId", True),
            stream_file_path=_stream_path(root, "streamfilepath"),
            deploy_name=_string(root, "deployName", True),
            message_id=_string(root, "messageId", False),
            additional_prompt=_string(root, "additionalPrompt", False),
            temperature=_decimal(root, "temperature"),
            max_tokens=_integer(root, "maxTokens"),
            reasoning_effort=_string(root, "reasoning_effort", True),
            verbosity=_string(root, "verbosity", True),
            create_library=_bool(root, "createLibrary"),
            tools=_tools(root),
            tools_specified="tools" in root,
        )

    def load_tools_only(self, file_path: str) -> tuple[CoreChatTool, ...]:
        """tools だけを持つ textData JSON から tools を読む。

        Parameters
        ----------
        file_path : str
            textData のファイルパス。

        Returns
        -------
        tuple[CoreChatTool, ...]
            ツールの列。

        Raises
        ------
        CoreSecuAiGentTextDataFailure
            読めない・tools 以外のキーがあるとき。
        """
        root = _read(file_path)
        if not isinstance(root, dict):
            raise _invalid()
        _validate_keys(root, TOOLS_ONLY_KEYS)
        if "tools" not in root:
            raise _invalid()
        return _tools(root)
