from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """アプリケーションの死活監視用エンドポイント。

    Returns
    -------
    dict[str, str]
        正常を表すステータス。
    """
    return {"status": "ok"}
