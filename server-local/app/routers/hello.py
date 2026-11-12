from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/api/hello", tags=["hello"])

HELLO_MESSAGE = "APIサーバは稼働中です。"


@router.get("", response_class=PlainTextResponse)
async def hello() -> str:
    return HELLO_MESSAGE
