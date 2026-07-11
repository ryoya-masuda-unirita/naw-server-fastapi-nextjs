"""ライブラリ生成モード(`createLibrary`)のLLM出力ストリームを振り分けるユーティリティ。

移植元(Spring Boot)の`LibraryStreamRouter`・`LibraryPromptTemplates`に対応する。
LLMには`<<<TITLE>>>\\n{タイトル}\\n<<<CONTENT>>>\\n{本文}\\n<<<COMMENT>>>\\n{補足}`という
厳密な形式で出力させ、本モジュールが受信デルタをマーカーで区間判定してタイトル/本文/
補足コメントの3区分に振り分ける。

移植元はコールバック(`Consumer<String>`)を`LlmChatPort.stream`へ渡して駆動する設計だが、
本ポートでは非同期ジェネレータがSSEバイト列を直接`yield`する構造に合わせ、
「デルタを1件受け取り、配信すべき(区分, テキスト)のリストを返す」関数型のインターフェースに
変更している。区切り判定アルゴリズム自体(チャンク境界をまたぐマーカーのhold-back処理を
含む)は移植元と同一のロジックを踏襲する。
"""

# ライブラリ生成モードでLLMに出力させる区切りマーカー。
TITLE_MARKER = "<<<TITLE>>>"
CONTENT_MARKER = "<<<CONTENT>>>"
COMMENT_MARKER = "<<<COMMENT>>>"

# ライブラリ生成時、最後のユーザ発話の先頭に前置する固定指示テキスト。
LIBRARY_USER_INSTRUCTION_PREFIX = (
    "出力はシステムプロンプトのルールに必ず準拠してください。\n"
    "以下の指示に従って、これまでの会話のやりとりをまとめてください。\n"
)

# ライブラリ生成完了後、確定タイトルが空だった場合のデフォルト値。
DEFAULT_LIBRARY_TITLE = "ライブラリ"

_State = str  # "BEFORE_TITLE" | "IN_TITLE" | "IN_CONTENT" | "IN_COMMENT"


def _held_back_length(s: str, marker: str) -> int:
    """`s`の末尾のうち`marker`の接頭辞になっている最長部分の長さを返す。

    マーカーがチャンク境界をまたぐ場合に備え、確定させずに保留すべき末尾の
    長さを求める。

    Args:
        s: 判定対象の文字列。
        marker: 区切りマーカー文字列。

    Returns:
        保留すべき末尾の文字数(該当なしは0)。
    """
    max_len = min(len(s), len(marker) - 1)
    for k in range(max_len, 0, -1):
        if marker.startswith(s[-k:]):
            return k
    return 0


class LibraryStreamRouter:
    """ライブラリ生成モードのLLM出力ストリームをタイトル/本文/補足コメントに振り分ける。

    `feed`にLLMからのテキストデルタを順に渡すと、そのデルタで新たに確定した
    区分ごとのテキストを`(区分, テキスト)`のタプルのリストとして返す。区分は
    `"title"`/`"content"`/`"comment"`のいずれか。ストリーム完了後は`flush`を
    呼び、保留中バッファを残らず吐き出す。

    永続化用の正本は`final_title`/`final_content`/`final_comment`で取得する。
    """

    def __init__(self) -> None:
        self._raw: list[str] = []
        self._pending: str = ""
        self._state: _State = "BEFORE_TITLE"
        self._title_started = False
        self._content_started = False
        self._comment_started = False

    def feed(self, delta: str) -> list[tuple[str, str]]:
        """LLMからのテキストデルタを1件処理し、新たに確定した区分テキストを返す。

        Args:
            delta: LLMから受信したテキストデルタ。

        Returns:
            `(区分, テキスト)`のリスト。区分は`"title"`/`"content"`/`"comment"`。
        """
        if not delta:
            return []
        self._raw.append(delta)
        self._pending += delta
        return self._process(end=False)

    def flush(self) -> list[tuple[str, str]]:
        """ストリーム完了時に呼ぶ。保留中バッファを残らず吐き出す。

        Returns:
            `(区分, テキスト)`のリスト。
        """
        return self._process(end=True)

    def _process(self, *, end: bool) -> list[tuple[str, str]]:
        emitted: list[tuple[str, str]] = []
        while True:
            if self._state == "IN_COMMENT":
                if self._pending:
                    text = self._emit("comment", self._pending)
                    if text:
                        emitted.append(("comment", text))
                    self._pending = ""
                return emitted

            marker = {
                "BEFORE_TITLE": TITLE_MARKER,
                "IN_TITLE": CONTENT_MARKER,
                "IN_CONTENT": COMMENT_MARKER,
            }[self._state]
            idx = self._pending.find(marker)
            if idx >= 0:
                if self._state == "IN_TITLE":
                    text = self._emit("title", self._pending[:idx])
                    if text:
                        emitted.append(("title", text))
                elif self._state == "IN_CONTENT":
                    text = self._emit("content", self._pending[:idx])
                    if text:
                        emitted.append(("content", text))
                # BEFORE_TITLE: マーカー前のテキスト(前置き)は破棄。
                self._pending = self._pending[idx + len(marker) :]
                self._state = {
                    "BEFORE_TITLE": "IN_TITLE",
                    "IN_TITLE": "IN_CONTENT",
                    "IN_CONTENT": "IN_COMMENT",
                }[self._state]
                continue

            # 完全なマーカーは未検出。マーカー先頭になり得る末尾を保留して残りを確定。
            hold = 0 if end else _held_back_length(self._pending, marker)
            safe = len(self._pending) - hold
            if safe > 0:
                if self._state == "IN_TITLE":
                    text = self._emit("title", self._pending[:safe])
                    if text:
                        emitted.append(("title", text))
                elif self._state == "IN_CONTENT":
                    text = self._emit("content", self._pending[:safe])
                    if text:
                        emitted.append(("content", text))
                # BEFORE_TITLE: 前置きは破棄。
                self._pending = self._pending[safe:]
            return emitted

    def _emit(self, kind: str, s: str) -> str:
        """区分の先頭であれば先頭の空白を取り除いたうえで配信対象文字列を返す。"""
        if not s:
            return ""
        started_attr = f"_{kind}_started"
        if not getattr(self, started_attr):
            s = s.lstrip()
            if not s:
                return ""
            setattr(self, started_attr, True)
        return s

    def final_title(self) -> str:
        """蓄積した全文からタイトルを確定する(永続化用の正本)。"""
        full = "".join(self._raw)
        t = full.find(TITLE_MARKER)
        c = full.find(CONTENT_MARKER)
        if t >= 0 and c > t:
            return full[t + len(TITLE_MARKER) : c].strip()
        return ""

    def final_content(self) -> str:
        """蓄積した全文から本文(md)を確定する。マーカー欠落時は全文を本文とみなす。"""
        full = "".join(self._raw)
        c = full.find(CONTENT_MARKER)
        cm = full.find(COMMENT_MARKER)
        if c >= 0:
            end = cm if cm > c else len(full)
            return full[c + len(CONTENT_MARKER) : end].strip()
        return full.strip()

    def final_comment(self) -> str:
        """蓄積した全文から補足コメントを確定する。マーカーがなければ空文字。"""
        full = "".join(self._raw)
        cm = full.find(COMMENT_MARKER)
        if cm >= 0:
            return full[cm + len(COMMENT_MARKER) :].strip()
        return ""
