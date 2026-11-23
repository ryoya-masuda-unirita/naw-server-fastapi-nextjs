from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/api/hello", tags=["hello"])

HELLO_MESSAGE = "APIサーバは稼働中です。"


@router.get("", response_class=PlainTextResponse)
async def hello() -> str:
    """稼働中であることを示す固定の文言をテキストで返す。

    ヘルスチェック用のため、サーバー認証キーの確認なしで呼べる。

    Returns
    -------
    str
        ``APIサーバは稼働中です。``
    """
    return HELLO_MESSAGE
