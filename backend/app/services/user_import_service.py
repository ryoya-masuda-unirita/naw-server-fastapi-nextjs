import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.group import Group, GroupUser
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_import_job import UserImportJob, UserImportJobStatus
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.password_history_repository import PasswordHistoryRepository
from app.repositories.tenant_repository import TenantRepository
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
        """CSVファイルをアップロードし、ユーザーを同期的に一括登録・更新する。

        S3/SQSを使う非同期構成の移植元とは異なり、アップロードされたCSVを
        メモリ上でパースし、その場でインポート処理まで完了させる縮小版。

        Args:
            file: アップロードされたCSVファイル。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            作成したインポートジョブのIDとステータス。
        """
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
            tenant = await TenantRepository.find_by_id(tenant_id, session)
            if not tenant:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found"
                )
            rows = await UserImportService._read_and_validate(file, errors)
            if errors:
                job.status = UserImportJobStatus.FAILED
                job.error_details = "\n".join(errors)
            else:
                row_errors = await UserImportService._process_rows(
                    rows, tenant, session
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
        """インポートジョブの状態を取得する。

        Args:
            job_id: インポートジョブID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            インポートジョブの状態。

        Raises:
            HTTPException: ジョブが存在しない、または別テナントの場合404を返す。
        """
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
        """アップロードされたファイルを読み込み、CSV形式・必須カラム・行内容を検証する。

        Args:
            file: アップロードされたCSVファイル。
            errors: 検証エラーを追記するリスト。

        Returns:
            検証済みの行データ一覧。検証エラーがある場合は空リスト。
        """
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
        """CSVのバイト列をUTF-8またはShift-JISとしてデコードする。

        Args:
            content: CSVファイルのバイト列。
            errors: デコード失敗時にエラーを追記するリスト。

        Returns:
            デコードされたテキスト。デコードに失敗した場合は空文字列。
        """
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
        """CSVの各行の項目内容（必須項目・文字数上限・値の妥当性）を検証する。

        Args:
            rows: 検証対象の行データ一覧。
            errors: 検証エラーを追記するリスト。
        """
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
        rows: list[dict[str, str]], tenant: Tenant, session: AsyncSession
    ) -> list[str]:
        """検証済みの行データを1行ずつユーザー登録・更新処理にかける。

        グループ・既存ユーザーは行数分のクエリを避けるため、先にまとめて取得する。

        Args:
            rows: 検証済みの行データ一覧。
            tenant: 対象テナント。
            session: 非同期DBセッション。

        Returns:
            行単位の処理エラー一覧。
        """
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
                    Group.tenant_id == tenant.id, Group.id.in_(all_group_ids)
                )
            )
            group_map = {group.id: group for group in result.scalars().all()}

        all_login_ids = {UserImportService._value(row, "login_id") for row in rows}
        user_map = await UserRepository.find_by_login_ids(
            all_login_ids, tenant.id, session
        )

        errors: list[str] = []
        for index, row in enumerate(rows, start=2):
            await UserImportService._process_row(
                row, tenant, index, group_map, user_map, errors, session
            )
        return errors

    @staticmethod
    async def _process_row(
        row: dict[str, str],
        tenant: Tenant,
        row_number: int,
        group_map: dict[str, Group],
        user_map: dict[str, User],
        errors: list[str],
        session: AsyncSession,
    ) -> None:
        """1行分のユーザー登録・更新・グループ所属の付け替えを行う。

        行内の処理はSAVEPOINTで囲み、この行だけの失敗が他の行の処理結果や
        既にコミット待ちの変更を巻き込まないようにする。

        Args:
            row: 対象行のCSVデータ。
            tenant: 対象テナント。
            row_number: エラーメッセージに含める行番号（ヘッダー行を1とした通し番号）。
            group_map: グループIDをキーとした事前取得済みのグループ。
            user_map: ログインIDをキーとした事前取得済みの既存ユーザー。
            errors: 行単位の処理エラーを追記するリスト。
            session: 非同期DBセッション。
        """
        login_id = UserImportService._value(row, "login_id")
        name = UserImportService._value(row, "name")
        password = UserImportService._value(row, "password")
        role = UserRole(UserImportService._value(row, "role").upper())
        create_login_key = UserImportService._value(row, "createLoginKey").lower()

        try:
            async with session.begin_nested():
                user = user_map.get(login_id)
                if user:
                    user.name = name
                    user.role = role
                    if create_login_key == "true":
                        user.login_key = uuid.uuid4().hex
                    elif create_login_key == "false":
                        user.login_key = None
                else:
                    login_key = uuid.uuid4().hex if create_login_key == "true" else None
                    user = User(
                        login_id=login_id,
                        tenant_id=tenant.id,
                        name=name,
                        role=role,
                        login_key=login_key,
                        is_required_password_reset=True,
                    )
                    session.add(user)
                    await session.flush()
                    user_map[login_id] = user
                    expired_at = datetime.now(timezone.utc) + timedelta(
                        days=tenant.pw_validity_period_days
                    )
                    await PasswordHistoryRepository.save(
                        user.id,
                        tenant.id,
                        hash_password(password),
                        session,
                        expired_at=expired_at,
                    )
                session.add(user)
                await session.flush()

                await session.execute(
                    delete(GroupUser).where(
                        GroupUser.tenant_id == tenant.id, GroupUser.user_id == user.id
                    )
                )
                group_ids = UserImportService._value(row, "groupIds")
                if group_ids:
                    for group_id in group_ids.split(","):
                        group_id = group_id.strip()
                        if not group_id:
                            continue
                        if group_id not in group_map:
                            errors.append(
                                f"行{row_number}: グループID '{group_id}' は存在しません"
                            )
                            continue
                        GroupUserRepository.add(group_id, tenant.id, user.id, session)
                await session.flush()
        except Exception as exc:
            errors.append(f"行{row_number}: ユーザーの登録に失敗しました: {exc}")

    @staticmethod
    def _value(row: dict[str, str], column: str) -> str:
        """CSV行から指定カラムの値を前後の空白を除いて取得する。

        Args:
            row: CSVの行データ。
            column: 取得対象のカラム名。

        Returns:
            前後の空白を除いた値。値が存在しない場合は空文字列。
        """
        return (row.get(column) or "").strip()
