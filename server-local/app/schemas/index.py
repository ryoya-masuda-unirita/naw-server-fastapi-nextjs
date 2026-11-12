import math
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.core.jsonutil import format_instant
from app.models import File, FilePart, FileStatus


class DeleteIndexFileRequest(BaseModel):
    """移植元 DeleteIndexFileRequest（JSON ボディ）。"""

    model_config = ConfigDict(extra="ignore")

    deletionServiceName: str | None = None
    physicalDelete: bool | None = None


class SyncIndexFilesRequest(BaseModel):
    """移植元 SyncIndexFilesRequest（JSON ボディ）。"""

    model_config = ConfigDict(extra="ignore")

    userId: str | None = None
    syncServiceName: str | None = None


def file_part_to_dict(part: FilePart) -> dict[str, Any]:
    return {
        "id": part.id,
        "tenantId": part.tenant_id,
        "fileId": part.file_id,
        "createdAt": format_instant(part.created_at),
        "updatedAt": format_instant(part.updated_at),
    }


def file_to_dict(file: File, parts: list[FilePart]) -> dict[str, Any]:
    """移植元 File エンティティを Jackson で出力した形（status は名前、日時は Instant）。"""
    return {
        "id": file.id,
        "tenantId": file.tenant_id,
        "name": file.name,
        "displayName": file.display_name,
        "reference": file.reference,
        "status": FileStatus(file.status).name,
        "userId": file.user_id,
        "indexId": file.index_id,
        "storageUrl": file.storage_url,
        "feedbackId": file.feedback_id,
        "roomId": file.room_id,
        "createdAt": format_instant(file.created_at),
        "updatedAt": format_instant(file.updated_at),
        "fileParts": [file_part_to_dict(p) for p in parts],
    }


UNSORTED: dict[str, bool] = {"empty": True, "sorted": False, "unsorted": True}


def page_to_dict(
    content: list[dict[str, Any]], page: int, size: int, total: int
) -> dict[str, Any]:
    """Spring Data 3.2 の PageImpl を Jackson でそのまま出力した形。

    呼び出し側（管理画面）は `content`・`totalElements` 等を読むため、
    フィールド構成を移植元と揃える。
    """
    total_pages = math.ceil(total / size) if size > 0 else 0
    return {
        "content": content,
        "pageable": {
            "pageNumber": page,
            "pageSize": size,
            "sort": dict(UNSORTED),
            "offset": page * size,
            "paged": True,
            "unpaged": False,
        },
        "last": page + 1 >= total_pages,
        "totalElements": total,
        "totalPages": total_pages,
        "first": page == 0,
        "size": size,
        "number": page,
        "sort": dict(UNSORTED),
        "numberOfElements": len(content),
        "empty": len(content) == 0,
    }
