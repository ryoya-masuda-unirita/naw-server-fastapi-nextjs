"""ファイル作成の共通ロジック。

`FileService`（Issue #87）と`IndexService`の追加学習API（Issue #92）の双方が
「インデックス配下にファイルを新規作成する」処理を必要とするが、`xxx_service.py`が
別の`yyy_service.py`を呼ぶ構造は禁止されているため、`core/credit_quota.py`と同様に
共通ロジックをここに切り出す。
"""

import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.file_storage import FileStorage
from app.models.file import File, FileStatus
from app.models.index import Index, IndexType
from app.models.user import User
from app.repositories.file_repository import FileRepository


def ensure_not_local(index: Index) -> None:
    """ローカルAPIサーバ向けインデックスへのファイル操作を拒否する。

    Args:
        index: 検証対象のインデックス。

    Raises:
        HTTPException: `index.type == LOCAL`の場合400を返す。
    """
    if index.type == IndexType.LOCAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ローカルAPIサーバへのリクエストを処理できません。",
        )


async def create_file_record(
    index: Index,
    name: str,
    display_name: str | None,
    reference: str | None,
    current_user: User,
    upload: UploadFile,
    tenant_id: str,
    storage: FileStorage,
    session: AsyncSession,
    feedback_id: str | None = None,
    room_id: str | None = None,
) -> File:
    """ファイル実体をストレージへ保存し、メタデータをDBに作成する。

    移植元`FileService.createFileWithAzureStorage`相当。本Issue（#87・#92）のスコープでは
    コンテンツ抽出（Tika）・分割・ベクトルDB登録（Issue #88スコープ）は行わない。

    Args:
        index: 保存先インデックス。
        name: ファイルの内部名。
        display_name: 表示名。
        reference: 参照情報。
        current_user: 作成を行うユーザー。
        upload: アップロードされたファイル。
        tenant_id: テナントID。
        storage: ファイルストレージ。
        session: 非同期DBセッション。
        feedback_id: 追加学習のデータソースがフィードバックの場合の紐付け先ID（Issue #92）。
        room_id: 追加学習のデータソースがルームの場合の紐付け先ID（Issue #92）。

    Returns:
        作成された File。

    Raises:
        HTTPException: ストレージ保存後のDB保存に失敗した場合、保存済みの実体を
            ロールバック削除した上で例外を送出する（移植元の例外時Blob削除を踏襲）。
    """
    file_id = uuid.uuid4().hex
    content = await upload.read()
    filename = upload.filename or name
    storage_url = await storage.upload(tenant_id, file_id, filename, content)
    try:
        file = File(
            id=file_id,
            tenant_id=tenant_id,
            name=name,
            display_name=display_name,
            reference=reference,
            status=FileStatus.ENABLE,
            user_id=current_user.id,
            index_id=index.id,
            storage_url=storage_url,
            feedback_id=feedback_id,
            room_id=room_id,
        )
        return await FileRepository.create(file, session)
    except Exception:
        await storage.delete(storage_url)
        raise
