import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.group import Group, GroupUser
from app.models.password_history import PasswordHistory
from app.models.user import User, UserRole
from app.models.user_import_job import UserImportJob, UserImportJobStatus
from app.repositories.user_import_job_repository import UserImportJobRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user_import import UserImportJobResponse, UserImportResponse


class UserImportService:
    REQUIRED_COLUMNS = {"login_id", "name", "password", "role"}
    MAX_ROWS = 100
    MAX_LOGIN_ID_LENGTH = 255
    MAX_NAME_LENGTH = 255
    MAX_PASSWORD_LENGTH = 255

    @staticmethod
    async def import_users(
        file: UploadFile, tenant_id: str, session: AsyncSession
    ) -> UserImportResponse:
        job = UserImportJob(
            tenant_id=tenant_id,
            status=UserImportJobStatus.PROCESSING,
            file_name=file.filename or "",
        )
        session.add(job)
        await session.flush()

        errors: list[str] = []
        rows: list[dict[str, str]] = []
        try:
            rows = await UserImportService._read_and_validate(file, errors)
            if errors:
                job.status = UserImportJobStatus.FAILED
                job.error_details = "\n".join(errors)
            else:
                row_errors = await UserImportService._process_rows(
                    rows, tenant_id, session
                )
                job.status = UserImportJobStatus.COMPLETED
                if row_errors:
                    job.error_details = "\n".join(row_errors)
        except Exception as exc:
            job.status = UserImportJobStatus.FAILED
            job.error_details = f"致命的なエラー: {exc}"

        job.completed_at = datetime.now(timezone.utc)
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return UserImportResponse(jobId=job.id, status=job.status)

    @staticmethod
    async def get_import_job(
        job_id: str, tenant_id: str, session: AsyncSession
    ) -> UserImportJobResponse:
        job = await UserImportJobRepository.find_by_id_and_tenant_id(
            job_id, tenant_id, session
        )
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Import job not found",
            )
        return UserImportJobResponse.from_job(job)

    @staticmethod
    async def _read_and_validate(
        file: UploadFile, errors: list[str]
    ) -> list[dict[str, str]]:
        file_name = file.filename or ""
        if not file_name:
            errors.append("ファイル名が指定されていません")
            return []
        if not file_name.lower().endswith(".csv"):
            errors.append("CSVファイルのみを受け付けます")
            return []
        if any(char in file_name for char in ("\n", "\r", "\t")):
            errors.append("ファイル名に使用できない文字が含まれています")
            return []

        content = await file.read()
        if not content:
            errors.append("ファイルが空です")
            return []

        text = UserImportService._decode_csv(content, errors)
        if errors:
            return []

        try:
            reader = csv.DictReader(io.StringIO(text))
            if not reader.fieldnames:
                errors.append("CSVファイルにヘッダー行が存在しません")
                return []
            missing_columns = UserImportService.REQUIRED_COLUMNS - set(
                reader.fieldnames
            )
            for column in sorted(missing_columns):
                errors.append(f"必須カラム '{column}' が存在しません")
            if errors:
                return []
            rows = list(reader)
        except csv.Error as exc:
            errors.append(f"CSVファイルの読み込みに失敗しました: {exc}")
            return []

        if not rows:
            errors.append("データ行が存在しません")
            return []
        if len(rows) > UserImportService.MAX_ROWS:
            errors.append(
                f"データ行数が上限（{UserImportService.MAX_ROWS}行）を超えています。"
                f"{UserImportService.MAX_ROWS}行以下にしてください。"
            )
            return []

        UserImportService._validate_rows(rows, errors)
        return rows

    @staticmethod
    def _decode_csv(content: bytes, errors: list[str]) -> str:
        for encoding in ("utf-8-sig", "cp932"):
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
        errors.append(
            "CSVの文字コードはUTF-8（BOM付き/なし）または Shift-JIS（MS932）で保存してください。"
        )
        return ""

    @staticmethod
    def _validate_rows(rows: list[dict[str, str]], errors: list[str]) -> None:
        login_ids: set[str] = set()
        for index, row in enumerate(rows, start=2):
            login_id = UserImportService._value(row, "login_id")
            if not login_id:
                errors.append(f"行{index}: ログインID（login_id）が空です")
            elif len(login_id) > UserImportService.MAX_LOGIN_ID_LENGTH:
                errors.append(
                    f"行{index}: ログインID（login_id）が"
                    f"{UserImportService.MAX_LOGIN_ID_LENGTH}文字を超えています"
                )
            elif login_id in login_ids:
                errors.append(f"行{index}: ログインID '{login_id}' が重複しています")
            else:
                login_ids.add(login_id)

            name = UserImportService._value(row, "name")
            if not name:
                errors.append(f"行{index}: 名前が空です")
            elif len(name) > UserImportService.MAX_NAME_LENGTH:
                errors.append(
                    f"行{index}: 名前が{UserImportService.MAX_NAME_LENGTH}文字を超えています"
                )

            password = UserImportService._value(row, "password")
            if not password:
                errors.append(f"行{index}: パスワードが空です")
            elif len(password) > UserImportService.MAX_PASSWORD_LENGTH:
                errors.append(
                    f"行{index}: パスワードが"
                    f"{UserImportService.MAX_PASSWORD_LENGTH}文字を超えています"
                )

            role = UserImportService._value(row, "role")
            if not role:
                errors.append(f"行{index}: ロールが空です")
            elif role.upper() not in UserRole.__members__:
                errors.append(
                    f"行{index}: ロール '{role}' は無効です（有効な値: USER, ADMIN, SYSTEM）"
                )

            create_login_key = UserImportService._value(row, "createLoginKey")
            if create_login_key and create_login_key.lower() not in {"true", "false"}:
                errors.append(
                    f"行{index}: createLoginKey '{create_login_key}' は無効です"
                    "（有効な値: true, false）"
                )

            group_ids = UserImportService._value(row, "groupIds")
            if group_ids:
                for group_id in group_ids.split(","):
                    if not group_id.strip():
                        errors.append(
                            f"行{index}: groupIdsに空のグループIDが含まれています"
                        )

    @staticmethod
    async def _process_rows(
        rows: list[dict[str, str]], tenant_id: str, session: AsyncSession
    ) -> list[str]:
        all_group_ids = {
            group_id.strip()
            for row in rows
            for group_id in UserImportService._value(row, "groupIds").split(",")
            if group_id.strip()
        }
        group_map: dict[str, Group] = {}
        if all_group_ids:
            result = await session.execute(
                select(Group).where(
                    Group.tenant_id == tenant_id, Group.id.in_(all_group_ids)
                )
            )
            group_map = {group.id: group for group in result.scalars().all()}

        errors: list[str] = []
        for index, row in enumerate(rows, start=2):
            await UserImportService._process_row(
                row, tenant_id, index, group_map, errors, session
            )
        return errors

    @staticmethod
    async def _process_row(
        row: dict[str, str],
        tenant_id: str,
        row_number: int,
        group_map: dict[str, Group],
        errors: list[str],
        session: AsyncSession,
    ) -> None:
        login_id = UserImportService._value(row, "login_id")
        name = UserImportService._value(row, "name")
        password = UserImportService._value(row, "password")
        role = UserRole(UserImportService._value(row, "role").upper())
        login_key = (
            uuid.uuid4().hex
            if UserImportService._value(row, "createLoginKey").lower() == "true"
            else None
        )

        try:
            user = await UserRepository.find_by_login_id(login_id, tenant_id, session)
            if user:
                user.name = name
                user.role = role
                user.login_key = login_key
            else:
                user = User(
                    login_id=login_id,
                    tenant_id=tenant_id,
                    name=name,
                    role=role,
                    login_key=login_key,
                    is_required_password_reset=True,
                )
                session.add(user)
                await session.flush()
                session.add(
                    PasswordHistory(
                        tenant_id=tenant_id,
                        user_id=user.id,
                        password=hash_password(password),
                    )
                )
            session.add(user)
            await session.flush()
        except Exception as exc:
            errors.append(f"行{row_number}: ユーザーの登録に失敗しました: {exc}")
            return

        await session.execute(
            delete(GroupUser).where(
                GroupUser.tenant_id == tenant_id, GroupUser.user_id == user.id
            )
        )
        group_ids = UserImportService._value(row, "groupIds")
        if not group_ids:
            return
        for group_id in group_ids.split(","):
            group_id = group_id.strip()
            if not group_id:
                continue
            if group_id not in group_map:
                errors.append(f"行{row_number}: グループID '{group_id}' は存在しません")
                continue
            session.add(
                GroupUser(
                    group_id=group_id,
                    tenant_id=tenant_id,
                    user_id=user.id,
                    is_admin=False,
                )
            )

    @staticmethod
    def _value(row: dict[str, str], column: str) -> str:
        return (row.get(column) or "").strip()
