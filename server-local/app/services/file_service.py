"""移植元 FileService（インデックスの学習ファイル管理）の移植。"""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.waha_client import SLOT_FILE, SLOT_OUTPUT, WahaClient
from app.core.errors import BadRequestError, EntityNotFoundError
from app.core.jsonutil import java_split
from app.models import File, FilePart, FileStatus
from app.repositories import file_repository
from app.repositories.file_repository import FileSearchCondition
from app.schemas.index import file_to_dict, page_to_dict
from app.schemas.message import UploadedFile

logger = logging.getLogger(__name__)

BOM = "﻿"
LINE_SEPARATOR = "\r\n"
FIELD_SEPARATOR = "\t"
SYNC_PAGE_SIZE = 100
SHORT_ID_LENGTH = 8
ADDITIONAL_LEARNING_SPLIT_LENGTH = "3000"
ADDITIONAL_LEARNING_DISPLAY_NAME = "フィードバック学習"
ADD_FILE_FAILED_MESSAGE = "ファイルの追加に失敗しました。"
DOWNLOAD_FAILED_MESSAGE = "ファイルをダウンロードできません"
DELETE_IDS_FILENAME_PREFIX = "ids"
DELETE_IDS_FILENAME_SUFFIX = ".txt"
UPLOAD_FALLBACK_FILENAME = "file"
DATE_PARAM_FORMAT = "%Y-%m-%d"


def _strip_bom(text: str) -> str:
    return text[1:] if text.startswith(BOM) else text


def _strip_quotes(value: str) -> str:
    """移植元の `replaceAll("^\\"|\\"$", "")`（先頭・末尾の引用符を 1 つずつ除去）。"""
    value = value.removeprefix('"')
    value = value.removesuffix('"')
    return value


def _split_fields(line: str) -> list[str]:
    return [_strip_quotes(f) for f in java_split(line, FIELD_SEPARATOR)]


def _split_path(full_path: str) -> tuple[str | None, str | None]:
    """java.nio.file.Path の getFileName() / getParent() 相当（`/` 区切り）。"""
    is_absolute = full_path.startswith("/")
    names = [n for n in full_path.split("/") if n]
    if not names:
        return (None if is_absolute else full_path), None
    file_name = names[-1]
    if len(names) > 1:
        parent = ("/" if is_absolute else "") + "/".join(names[:-1])
    else:
        parent = "/" if is_absolute else None
    return file_name, parent


def parse_date_param(value: str | None) -> datetime | None:
    """`yyyy-MM-dd` をプロセスのローカルタイムゾーンの 0 時として解釈する。

    移植元は SimpleDateFormat（JVM のタイムゾーン）で解釈していたため、
    コンテナの TZ に合わせる。DB は UTC の naive 値で比較する。
    """
    if value is None:
        return None
    try:
        parsed = datetime.strptime(value, DATE_PARAM_FORMAT)
    except ValueError as e:
        # 移植元は ParseException が未処理で 500 になるが、入力不備なので 400 で返す
        raise BadRequestError(f"日付の形式が正しくありません: {value}") from e
    local_midnight = parsed.astimezone()
    return local_midnight.astimezone(UTC).replace(tzinfo=None)


async def _with_parts(session: AsyncSession, files: list[File]) -> list[dict[str, Any]]:
    parts = await file_repository.find_parts_by_file_ids(session, [f.id for f in files])
    return [file_to_dict(f, parts[f.id]) for f in files]


async def search_files(
    session: AsyncSession, cond: FileSearchCondition, page: int, size: int
) -> dict[str, Any]:
    # PageRequest.of と同じ検証（IllegalArgumentException → 400）
    if page < 0:
        raise BadRequestError("Page index must not be less than zero")
    if size < 1:
        raise BadRequestError("Page size must not be less than one")
    files, total = await file_repository.search(session, cond, page * size, size)
    return page_to_dict(await _with_parts(session, files), page, size, total)


def _parse_create_result(tsv_content: str | None) -> tuple[str, list[str]]:
    if tsv_content is None:
        raise RuntimeError(ADD_FILE_FAILED_MESSAGE)
    lines = java_split(_strip_bom(tsv_content), LINE_SEPARATOR)
    if not lines:
        raise RuntimeError(ADD_FILE_FAILED_MESSAGE)
    file_id = ""
    part_ids: list[str] = []
    for line in lines:
        fields = _split_fields(line)
        if len(fields) < 2:
            raise RuntimeError(ADD_FILE_FAILED_MESSAGE)
        file_id = fields[0]
        part_ids.append(fields[1])
    return file_id, part_ids


async def _run_waha_create(
    session: AsyncSession,
    waha: WahaClient,
    *,
    service_name: str | None,
    file_name: str | None,
    display_name: str | None,
    reference: str | None,
    user_id: str | None,
    index_id: str,
    upload: UploadedFile | None,
    split_length: str | None,
    tenant_id: str,
    feedback_id: str | None,
    room_id: str | None,
) -> dict[str, Any]:
    session_id = await waha.start_session()
    try:
        if upload is None:
            raise BadRequestError("ファイルが指定されていません")
        await waha.upload_file(
            filename=upload.filename or UPLOAD_FALLBACK_FILENAME,
            content=upload.data,
            slot=SLOT_FILE,
            session_id=session_id,
            content_type=upload.content_type,
        )
        await waha.execute_learning(
            session_id, service_name or "", split_length, reference
        )
        await waha.get_results(session_id)
        tsv_content = await waha.download_file(session_id, SLOT_OUTPUT)
    finally:
        await waha.end_session(session_id)

    file_id, part_ids = _parse_create_result(tsv_content)
    return await _save(
        session,
        file_id=file_id,
        file_name=file_name,
        display_name=display_name,
        reference=reference,
        user_id=user_id,
        index_id=index_id,
        part_ids=part_ids,
        tenant_id=tenant_id,
        feedback_id=feedback_id,
        room_id=room_id,
    )


async def _save(
    session: AsyncSession,
    *,
    file_id: str,
    file_name: str | None,
    display_name: str | None,
    reference: str | None,
    user_id: str | None,
    index_id: str,
    part_ids: list[str],
    tenant_id: str,
    feedback_id: str | None,
    room_id: str | None,
) -> dict[str, Any]:
    file = await file_repository.find_by_id_and_tenant_id(session, file_id, tenant_id)
    if file is None:
        file = File(
            id=file_id,
            tenant_id=tenant_id,
            name=file_name or "",
            status=int(FileStatus.ENABLE),
            user_id=user_id or "",
            index_id=index_id,
        )
        session.add(file)
    file.tenant_id = tenant_id
    file.name = file_name or ""
    file.display_name = display_name
    file.reference = reference
    file.user_id = user_id or ""
    file.index_id = index_id
    file.status = int(FileStatus.ENABLE)
    file.feedback_id = feedback_id
    file.room_id = room_id
    file.touch()
    await session.flush()

    for part_id in part_ids:
        # 移植元は JPA の merge で保存するため、同じ ID のパートは上書きになる
        existing = await session.get(FilePart, part_id)
        if existing is None:
            session.add(FilePart(id=part_id, tenant_id=tenant_id, file_id=file_id))
        else:
            existing.tenant_id = tenant_id
            existing.file_id = file_id
    await session.commit()
    return (await _with_parts(session, [file]))[0]


async def _run_waha_delete(
    session: AsyncSession,
    waha: WahaClient,
    *,
    service_name: str | None,
    file_id: str,
    index_id: str,
    physical_delete: bool,
) -> None:
    file = await file_repository.find_by_id_and_index_id(session, file_id, index_id)
    if file is None:
        raise EntityNotFoundError("ファイルが存在しません。")
    parts = await file_repository.find_parts_by_file_ids(session, [file.id])
    ids_text = "".join(f"{p.id}\n" for p in parts[file.id])

    session_id = await waha.start_session()
    try:
        await waha.upload_file(
            filename=(
                f"{DELETE_IDS_FILENAME_PREFIX}{uuid.uuid4().hex}"
                f"{DELETE_IDS_FILENAME_SUFFIX}"
            ),
            content=ids_text.encode("utf-8"),
            slot=SLOT_FILE,
            session_id=session_id,
        )
        await waha.execute(session_id, service_name or "")
        await waha.get_results(session_id)
        if physical_delete:
            await file_repository.delete_by_id(session, file_id)
        else:
            file.status = int(FileStatus.DELETED)
            file.touch()
        await session.commit()
    finally:
        await waha.end_session(session_id)


async def create_file(
    session: AsyncSession,
    waha: WahaClient,
    *,
    creation_service_name: str | None,
    name: str | None,
    display_name: str | None,
    reference: str | None,
    user_id: str | None,
    index_id: str,
    upload: UploadedFile | None,
    split_length: str | None,
    tenant_id: str,
) -> dict[str, Any]:
    return await _run_waha_create(
        session,
        waha,
        service_name=creation_service_name,
        file_name=name,
        display_name=display_name,
        reference=reference,
        user_id=user_id,
        index_id=index_id,
        upload=upload,
        split_length=split_length,
        tenant_id=tenant_id,
        feedback_id=None,
        room_id=None,
    )


async def update_file(
    session: AsyncSession,
    waha: WahaClient,
    *,
    creation_service_name: str | None,
    deletion_service_name: str | None,
    file_id: str,
    name: str | None,
    display_name: str | None,
    reference: str | None,
    user_id: str | None,
    index_id: str,
    upload: UploadedFile | None,
    split_length: str | None,
    tenant_id: str,
) -> dict[str, Any]:
    if upload is None or upload.is_empty():
        # 移植元は getReferenceById で取得するため、インデックス・テナントは見ない
        file = await file_repository.find_by_id(session, file_id)
        if file is None:
            raise EntityNotFoundError("ファイルが存在しません。")
        if display_name is not None:
            file.display_name = display_name
        if reference is not None:
            file.reference = reference
        file.touch()
        await session.commit()
        return (await _with_parts(session, [file]))[0]

    # ファイルを差し替える場合は、Waha! 側の旧データを削除してから登録し直す
    await _run_waha_delete(
        session,
        waha,
        service_name=deletion_service_name,
        file_id=file_id,
        index_id=index_id,
        physical_delete=True,
    )
    return await _run_waha_create(
        session,
        waha,
        service_name=creation_service_name,
        file_name=name,
        display_name=display_name,
        reference=reference,
        user_id=user_id,
        index_id=index_id,
        upload=upload,
        split_length=split_length,
        tenant_id=tenant_id,
        feedback_id=None,
        room_id=None,
    )


async def delete_file(
    session: AsyncSession,
    waha: WahaClient,
    *,
    deletion_service_name: str | None,
    file_id: str,
    index_id: str,
    physical_delete: bool,
) -> None:
    await _run_waha_delete(
        session,
        waha,
        service_name=deletion_service_name,
        file_id=file_id,
        index_id=index_id,
        physical_delete=physical_delete,
    )


def _build_synced_file(
    fields: list[str], tenant_id: str, user_id: str | None, index_id: str
) -> File:
    file_id = fields[2]
    normalized_path = fields[0].replace('"', "").replace("\\", "/")
    file_name, parent = _split_path(normalized_path)
    short_id = file_id[:SHORT_ID_LENGTH]
    default_name = f"ファイル{short_id}"
    name = file_name if file_name else default_name
    reference = parent if parent else default_name
    return File(
        id=file_id,
        tenant_id=tenant_id,
        name=name,
        display_name=name,
        reference=reference,
        status=int(FileStatus.ENABLE),
        user_id=user_id or "",
        index_id=index_id,
    )


async def sync_files(
    session: AsyncSession,
    waha: WahaClient,
    *,
    sync_service_name: str | None,
    index_id: str,
    tenant_id: str,
    user_id: str | None,
) -> None:
    files: dict[str, File] = {}
    parts: dict[str, list[str]] = {}

    session_id = await waha.start_session()
    # 移植元はページングのループ構造を持つが、1 回で抜ける実装のため 1 ページ分のみ取得する
    await waha.execute_sync(session_id, sync_service_name or "", 0, SYNC_PAGE_SIZE)
    await waha.get_results(session_id)
    tsv_content = await waha.download_file(session_id, SLOT_OUTPUT)
    if tsv_content is not None:
        for line in java_split(_strip_bom(tsv_content), LINE_SEPARATOR):
            sanitized = line.replace("\n", "").replace("\r", "")
            fields = _split_fields(sanitized)
            file_id = fields[2]
            if file_id not in files:
                files[file_id] = _build_synced_file(
                    fields, tenant_id, user_id, index_id
                )
                parts[file_id] = []
            parts[file_id].append(fields[1])
    await waha.end_session(session_id)

    existing_ids = await file_repository.find_all_ids(session)
    for file_id, file in files.items():
        if file_id in existing_ids:
            continue
        session.add(file)
        await session.flush()
        for part_id in parts[file_id]:
            session.add(FilePart(id=part_id, tenant_id=tenant_id, file_id=file_id))
    await session.commit()


async def additional_learning(
    session: AsyncSession,
    waha: WahaClient,
    *,
    creation_service_name: str | None,
    index_id: str,
    feedback_id: str | None,
    room_id: str | None,
    user_id: str | None,
    tenant_id: str,
    content: UploadedFile | None,
) -> None:
    # feedbackId: 特定の質問回答のペアを学習する / roomId: ルーム内の全メッセージを学習する
    not_specified = feedback_id is None and room_id is None
    confused = feedback_id is not None and room_id is not None
    if not_specified or confused:
        raise BadRequestError("追加学習のデータソースが正しく指定されていません。")
    if feedback_id is not None:
        file_name = f"追加学習_{feedback_id}.md"
        reference = f"フィードバック_{feedback_id}"
    else:
        file_name = f"追加学習_ルーム_{room_id}.md"
        reference = f"フィードバック_{room_id}"
    await _run_waha_create(
        session,
        waha,
        service_name=creation_service_name,
        file_name=file_name,
        display_name=ADDITIONAL_LEARNING_DISPLAY_NAME,
        reference=reference,
        user_id=user_id,
        index_id=index_id,
        upload=content,
        split_length=ADDITIONAL_LEARNING_SPLIT_LENGTH,
        tenant_id=tenant_id,
        feedback_id=feedback_id,
        room_id=room_id,
    )


def download_file() -> None:
    """移植元は未実装（Waha! からの取り出しが TODO）で常に RuntimeException を投げる。"""
    raise RuntimeError(DOWNLOAD_FAILED_MESSAGE)
