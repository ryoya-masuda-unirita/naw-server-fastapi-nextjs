from fastapi import APIRouter, Response, status

from app.core.deps import SessionDep
from app.services import library_content_service

router = APIRouter(prefix="/api/libraries", tags=["libraries"])


@router.get("/{library_id}/content")
async def get_library_content(library_id: str, session: SessionDep) -> dict[str, str]:
    return {"data": await library_content_service.get_content(session, library_id)}


@router.delete("/{library_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_library_content(library_id: str, session: SessionDep) -> Response:
    await library_content_service.delete_content(session, library_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
