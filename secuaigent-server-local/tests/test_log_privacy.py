"""会話の本文・アクセストークンをログに出さないことのテスト（NAW-1438）。

ログを閲覧できる人に、会話の内容が見えてはならない。本文をそのまま出すと漏れるため、
件数・長さ・ID・ツール名・トークンの有無といった、中身を含まない情報だけを出す。
DEBUG を有効にしても漏れないよう、レベルを DEBUG にして確かめる。
"""

import json
import logging
from typing import Any

import httpx
import pytest

from tests.conftest import FakeWahaClient
from tests.helpers import multipart_files

CONTENT_URL = "/api/messages/content"

SECRET_QUESTION = "社外秘の質問テキスト"
SECRET_ADDITIONAL_PROMPT = "社外秘の追加プロンプト"
SECRET_HISTORY_QUESTION = "社外秘の履歴の質問"
SECRET_HISTORY_ANSWER = "社外秘の履歴の回答"
SECRET_ANSWER = "社外秘の回答テキスト"
SECRET_SERVER_LABEL = "社外秘のサーバー名"
SECRET_ACCESS_TOKEN = "token-secret-abc"

PRIVATE_TEXT_DATA: dict[str, Any] = {
    "assistantId": "svc",
    "messageId": "msg-1",
    "additionalPrompt": SECRET_ADDITIONAL_PROMPT,
    "userInput": SECRET_QUESTION,
    "historyMessages": [
        {"type": "USER", "content": SECRET_HISTORY_QUESTION},
        {"type": "ASSISTANT", "content": SECRET_HISTORY_ANSWER},
    ],
    "accessToken": SECRET_ACCESS_TOKEN,
    "tools": [{"name": "web_search", "server_label": SECRET_SERVER_LABEL}],
    "createLibrary": False,
    "tenantId": "tenant-1",
}


@pytest.fixture
async def logged_text(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    caplog: pytest.LogCaptureFixture,
) -> str:
    """会話の本文を含むリクエストを 1 回処理し、そのあいだに出た全レベルのログを返す。

    Parameters
    ----------
    client : httpx.AsyncClient
        テスト用の HTTP クライアント。
    fake_waha : FakeWahaClient
        Waha! の代わりに使う偽物。回答の出力ファイルに、秘密の回答を返させる。
    caplog : pytest.LogCaptureFixture
        ログの取得。DEBUG まで取る（DEBUG を有効にしても、漏れないことを確かめるため）。

    Returns
    -------
    str
        処理中に出たログの全文。
    """
    fake_waha.download_content = json.dumps(
        {"answer": SECRET_ANSWER}, ensure_ascii=False
    )
    with caplog.at_level(logging.DEBUG):
        res = await client.post(CONTENT_URL, files=multipart_files(PRIVATE_TEXT_DATA))
    assert res.status_code == 200
    return caplog.text


@pytest.mark.parametrize(
    "secret",
    [
        SECRET_QUESTION,
        SECRET_ADDITIONAL_PROMPT,
        SECRET_HISTORY_QUESTION,
        SECRET_HISTORY_ANSWER,
        SECRET_ANSWER,
        SECRET_SERVER_LABEL,
        SECRET_ACCESS_TOKEN,
    ],
)
async def test_secret_is_not_logged(logged_text: str, secret: str) -> None:
    """質問・追加のプロンプト・履歴・回答・ツール設定・アクセストークンの値が、ログに出ないこと"""
    assert secret not in logged_text


async def test_content_is_still_sent_to_waha(
    logged_text: str, fake_waha: FakeWahaClient
) -> None:
    """ログから本文を消しても、Waha! には、質問・履歴・アクセストークンを、そのまま送ること"""
    assert (
        logged_text
    )  # ログを取得できている（取得の失敗で、空のまま通らないようにする）
    uploads = {u.slot: u.content.decode("utf-8") for u in fake_waha.uploads}
    assert SECRET_HISTORY_QUESTION in uploads["history"]
    assert SECRET_HISTORY_ANSWER in uploads["history"]
    assert SECRET_QUESTION in uploads["question"]
    assert json.loads(uploads["textdata"])["accessToken"] == SECRET_ACCESS_TOKEN


@pytest.mark.parametrize(
    "expected",
    [
        # 受信したリクエスト: 本文の代わりに、件数・有無・ID・ツール名を出す
        "Received message content request",
        "historyCount=2",
        "hasAccessToken=True",
        "messageId=msg-1",
        "web_search",
        # 会話履歴のファイル: 件数だけ
        "Preparing histories.json",
        "count=2",
        # textData.json: ツール名・メッセージ ID・トークンの有無
        "Preparing textData.json",
        # 出力ファイル: 長さだけ
        "Waha outputfile downloaded",
    ],
)
async def test_non_content_details_are_logged(logged_text: str, expected: str) -> None:
    """障害の調査に使う、本文を含まない情報（件数・ID・ツール名・トークンの有無）が、ログに残ること"""
    assert expected in logged_text
