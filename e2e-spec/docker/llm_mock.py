"""e2e-spec 専用の Azure OpenAI 互換モックサーバー（標準ライブラリだけで動く）。

backend の LLM 呼び出し（Chat Completions API と Responses API のストリーミング）を受け、
最後のユーザー発話をそのまま返す（エコー）。実際の LLM を使わずに「回答が返る」ことを確かめるためのもの。

- 回答は `[echo] <最後のユーザー発話>`。ライブラリ作成（「これまでの会話のやりとりをまとめてください」を含む指示）のときは、
  `<<<TITLE>>>` `<<<CONTENT>>>` `<<<COMMENT>>>` の形式（タイトルは `モックのライブラリ-<通し番号>`）で返す
- リクエストで受け取った内容の確認用に、ツール（web 検索）を指定したときは回答の末尾へ `[mock:tools] web_search` の行を足す
- 回答のたびに `[mock:call] <通し番号>` の行を足す（再生成・編集で「新しい回答が作られた」ことを、前の回答との違いで確かめるため）
- 最後のユーザー発話に `[MOCK_ERROR]` を含むと HTTP 500 を返す（API エラーの確認用）
- 最後のユーザー発話に `[MOCK_SLOW]` を含むと、1 チャンクごとに少し待つ（ストリーミング中の表示の確認用）
"""

import itertools
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8080
CHUNK_SIZE = 8
SLOW_CHUNK_DELAY_SECONDS = 0.4
LIBRARY_INSTRUCTION = "これまでの会話のやりとりをまとめてください"
ERROR_MARKER = "[MOCK_ERROR]"
SLOW_MARKER = "[MOCK_SLOW]"
# 回答ごとの通し番号（プロセスが動いている間、1 から増える）
call_counter = itertools.count(1)
# トークン数は文字数から決める（プラン制限の確認で使うため、同じ入力なら毎回同じ値になるようにする）
CHARS_PER_TOKEN = 4


def message_text(content) -> str:
    """メッセージの content（文字列、またはパートのリスト）からテキストだけを取り出す。"""
    if isinstance(content, str):
        return content
    texts = []
    for part in content or []:
        if isinstance(part, dict) and part.get("type") in ("text", "input_text"):
            texts.append(part.get("text", ""))
    return "\n".join(texts)


def last_user_text(messages) -> str:
    """会話履歴の最後のユーザー発話のテキスト。"""
    for message in reversed(messages):
        if message.get("role") == "user":
            return message_text(message.get("content"))
    return ""


def build_library(number: int) -> str:
    """ライブラリ作成のときの出力。タイトル・本文・補足を `<<<TITLE>>>` などの区切りで返す。

    ビューアの確認用に、見出し・箇条書き・表・グラフ・ボタンを含む Markdown にする。タイトルと本文に通し番号を入れ、
    複数のライブラリを切り替えたときに区別できるようにする。
    """
    chart = json.dumps(
        {"version": 1, "title": "モックのグラフ", "categories": ["A", "B"], "series": [{"name": "値", "values": [1, 2]}]},
        ensure_ascii=False,
    )
    content = (
        f"# モックのライブラリ-{number}\n\n"
        "## 概要\n\n"
        f"これはエコーで作った本文です（{number}）。\n\n"
        "- 箇条書き1\n- 箇条書き2\n\n"
        "| 項目 | 値 |\n|---|---|\n| A | 1 |\n\n"
        f"```chart:bar\n{chart}\n```\n\n"
        '<button type="button">PDF保存</button>\n'
    )
    return f"<<<TITLE>>>\nモックのライブラリ-{number}\n<<<CONTENT>>>\n{content}<<<COMMENT>>>\nモックが作成しました。"


def build_answer(user_text: str, tools) -> str:
    """最後のユーザー発話から回答を作る。"""
    number = next(call_counter)
    if LIBRARY_INSTRUCTION in user_text:
        return build_library(number)
    answer = f"[echo] {user_text}"
    if tools:
        answer += "\n\n[mock:tools] " + ",".join(tool.get("type", "") for tool in tools)
    return answer + f"\n\n[mock:call] {number}"


def chunks_of(text: str) -> list[str]:
    """テキストを固定長のチャンクに分ける。"""
    return [text[i : i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)] or [""]


def count_tokens(text: str) -> int:
    """文字数から決めたトークン数（1 以上）。"""
    return max(1, len(text) // CHARS_PER_TOKEN)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):  # noqa: A002 - 標準出力に流す
        print(f"[llm-mock] {self.address_string()} {format % args}", flush=True)

    def _send_json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _write_raw(self, payload: bytes) -> None:
        """chunked 転送の 1 チャンクとして書く。"""
        self.wfile.write(f"{len(payload):x}\r\n".encode() + payload + b"\r\n")
        self.wfile.flush()

    def _write_event(self, data: dict, event: str | None = None) -> None:
        head = f"event: {event}\n" if event else ""
        self._write_raw(f"{head}data: {json.dumps(data, ensure_ascii=False)}\n\n".encode())

    def _end_stream(self) -> None:
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def do_GET(self) -> None:  # noqa: N802
        self._send_json(200, {"status": "ok"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        path = self.path.split("?")[0]
        is_responses = path.endswith("/responses")
        messages = body.get("input" if is_responses else "messages", [])
        user_text = last_user_text(messages)

        if ERROR_MARKER in user_text:
            self._send_json(500, {"error": {"code": "mock_error", "message": "モックのエラーです"}})
            return

        answer = build_answer(user_text, body.get("tools"))
        prompt_tokens = count_tokens("".join(message_text(m.get("content")) for m in messages))
        completion_tokens = count_tokens(answer)
        delay = SLOW_CHUNK_DELAY_SECONDS if SLOW_MARKER in user_text else 0.0

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        if is_responses:
            self._stream_responses(answer, prompt_tokens, completion_tokens, delay)
        else:
            self._stream_chat_completions(body.get("model", "mock"), answer, prompt_tokens, completion_tokens, delay)
        self._end_stream()

    def _stream_chat_completions(self, model, answer, prompt_tokens, completion_tokens, delay) -> None:
        base = {"id": "chatcmpl-mock", "object": "chat.completion.chunk", "created": int(time.time()), "model": model}
        for text in chunks_of(answer):
            self._write_event({**base, "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}]})
            time.sleep(delay)
        self._write_event({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
        usage = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        }
        self._write_event({**base, "choices": [], "usage": usage})
        self._write_raw(b"data: [DONE]\n\n")

    def _stream_responses(self, answer, prompt_tokens, completion_tokens, delay) -> None:
        sequence = 0
        for text in chunks_of(answer):
            sequence += 1
            self._write_event(
                {
                    "type": "response.output_text.delta",
                    "item_id": "msg_mock",
                    "output_index": 0,
                    "content_index": 0,
                    "delta": text,
                    "sequence_number": sequence,
                },
                event="response.output_text.delta",
            )
            time.sleep(delay)
        usage = {
            "input_tokens": prompt_tokens,
            "output_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        }
        self._write_event(
            {
                "type": "response.completed",
                "sequence_number": sequence + 1,
                "response": {"id": "resp_mock", "object": "response", "status": "completed", "usage": usage},
            },
            event="response.completed",
        )


if __name__ == "__main__":
    print(f"[llm-mock] listening on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
