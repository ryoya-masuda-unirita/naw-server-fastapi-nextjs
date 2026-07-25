import csv
import io
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.file_storage import get_user_import_file_storage
from app.models.user import UserRole
from app.models.user_import_job import UserImportJob, UserImportJobStatus
from app.repositories.tenant_repository import TenantRepository
from app.repositories.user_import_job_repository import UserImportJobRepository
from app.schemas.user_import import UserImportJobResponse, UserImportResponse
from app.services.user_import_queue_service import UserImportQueueService


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
        """CSVファイルを検証・アップロードし、ユーザー登録をSQS経由で非同期に行わせる。

        バリデーション（CSV形式・必須カラム・行内容）のみをこの場で行い、通過した
        場合はファイルをストレージ（S3）にアップロードしてSQSに送信、即座に受付
        済みのレスポンスを返す。実際の行ごとの登録処理は`UserImportListener`が
        キュー受信時に行う。

        Args:
            file: アップロードされたCSVファイル。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            作成したインポートジョブのIDとステータス。
        """
        job = UserImportJob(
            tenant_id=tenant_id,
            status=UserImportJobStatus.PENDING,
            file_name=file.filename or "",
        )
        session.add(job)
        await session.flush()

        errors: list[str] = []
        try:
            tenant = await TenantRepository.find_by_id(tenant_id, session)
            if not tenant:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found"
                )
            content = await UserImportService._read_and_validate(file, errors)
            if errors:
                job.status = UserImportJobStatus.FAILED
                job.error_details = "\n".join(errors)
                job.completed_at = datetime.now(timezone.utc)
            else:
                storage = get_user_import_file_storage()
                storage_url = await storage.upload(
                    tenant_id, job.id, file.filename or "users.csv", content
                )
                try:
                    await UserImportQueueService.send_import_message(
                        job.id, tenant_id, storage_url
                    )
                except Exception:
                    # アップロード済みファイルがどこからも参照されないまま
                    # S3上に残り続けないよう、キュー送信失敗時は削除しておく。
                    await storage.delete(storage_url)
                    raise
                job.storage_url = storage_url
                job.queued_at = datetime.now(timezone.utc)
                session.add(job)
                await session.flush()
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
    async def _read_and_validate(file: UploadFile, errors: list[str]) -> bytes:
        """アップロードされたファイルを読み込み、CSV形式・必須カラム・行内容を検証する。

        検証を通過したファイルの生のバイト列をそのまま返す（ストレージへの
        アップロード・キュー受信側での再パースに使うため、行データには変換しない）。

        Args:
            file: アップロードされたCSVファイル。
            errors: 検証エラーを追記するリスト。

        Returns:
            検証済みのファイル内容（バイト列）。検証エラーがある場合は空バイト列。
        """
        file_name = file.filename or ""
        if not file_name:
            errors.append("ファイル名が指定されていません")
            return b""
        if not file_name.lower().endswith(".csv"):
            errors.append("CSVファイルのみを受け付けます")
            return b""
        if any(char in file_name for char in ("\n", "\r", "\t")):
            errors.append("ファイル名に使用できない文字が含まれています")
            return b""

        content = await file.read()
        if not content:
            errors.append("ファイルが空です")
            return b""

        text = UserImportService._decode_csv(content, errors)
        if errors:
            return b""

        try:
            reader = csv.DictReader(io.StringIO(text))
            if not reader.fieldnames:
                errors.append("CSVファイルにヘッダー行が存在しません")
                return b""
            missing_columns = UserImportService.REQUIRED_COLUMNS - set(
                reader.fieldnames
            )
            for column in sorted(missing_columns):
                errors.append(f"必須カラム '{column}' が存在しません")
            if errors:
                return b""
            rows = list(reader)
        except csv.Error as exc:
            errors.append(f"CSVファイルの読み込みに失敗しました: {exc}")
            return b""

        if not rows:
            errors.append("データ行が存在しません")
            return b""
        if len(rows) > UserImportService.MAX_ROWS:
            errors.append(
                f"データ行数が上限（{UserImportService.MAX_ROWS}行）を超えています。"
                f"{UserImportService.MAX_ROWS}行以下にしてください。"
            )
            return b""

        UserImportService._validate_rows(rows, errors)
        return b"" if errors else content

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
    def _value(row: dict[str, str], column: str) -> str:
        """CSV行から指定カラムの値を前後の空白を除いて取得する。

        Args:
            row: CSVの行データ。
            column: 取得対象のカラム名。

        Returns:
            前後の空白を除いた値。値が存在しない場合は空文字列。
        """
        return (row.get(column) or "").strip()
