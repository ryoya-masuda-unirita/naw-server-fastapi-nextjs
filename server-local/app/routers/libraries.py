from fastapi import APIRouter, Response, status

from app.core.deps import SessionDep
from app.services import library_content_service

router = APIRouter(prefix="/api/libraries", tags=["libraries"])


@router.get("/{library_id}/content")
async def get_library_content(library_id: str, session: SessionDep) -> dict[str, str]:
    """回答と一緒に生成したライブラリの本文を返す。

    Parameters
    ----------
    library_id : str
        NAW 本体のライブラリ ID。
    session : AsyncSession
        DB セッション。

    Returns
    -------
    dict[str, str]
        ``{"data": 本文}``。

    Raises
    ------
    EntityNotFoundError
        ライブラリの本文が保存されていない場合（404）。
    """
    return {"data": await library_content_service.get_content(session, library_id)}


@router.delete("/{library_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_library_content(library_id: str, session: SessionDep) -> Response:
    """ライブラリの本文を削除する。

    移植元と同じく、存在しない ID でもエラーにせず 204 を返す。

    Parameters
    ----------
    library_id : str
        NAW 本体のライブラリ ID。
    session : AsyncSession
        DB セッション。

    Returns
    -------
    Response
        本文なしの 204 応答。
    """
    await library_content_service.delete_content(session, library_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
