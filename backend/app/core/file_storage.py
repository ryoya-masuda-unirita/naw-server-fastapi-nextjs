import shutil
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse

import aioboto3
from botocore.exceptions import ClientError

from app.core.config import get_aws_settings, get_settings


class FileStorage(Protocol):
    """ファイル実体の永続化を抽象化するインターフェース。

    移植元（Spring Boot）の`AzureStorageService`はAzure Blob Storageに直接依存しており
    抽象化されていないが、FastAPI版では将来的なストレージ実装の差し替え（例: S3への移行）
    を見据え、このプロトコルの背後に実装を隠蔽する。
    """

    async def upload(
        self, tenant_id: str, file_id: str, filename: str, content: bytes
    ) -> str:
        """ファイルをアップロードし、`storage_url`を返す。"""
        ...

    async def download(self, storage_url: str) -> bytes:
        """`storage_url`からファイルの内容をダウンロードする。"""
        ...

    async def delete(self, storage_url: str) -> None:
        """`storage_url`が指すファイルを物理削除する。存在しない場合は何もしない。"""
        ...


class LocalFileStorage:
    """ローカルファイルシステムを使ったファイルストレージ実装。

    インフラ（AWS S3バケット等）が未整備な現時点の暫定実装。`{root}/{tenant_id}/
    {file_id}_{filename}`に保存し、`storage_url`には`file://`スキームの絶対パスを格納する。
    S3等への移行時は`FileStorage`を実装する別クラスに差し替えるだけでよい設計とする。
    """

    def __init__(self, root: Path) -> None:
        self._root = root

    async def upload(
        self, tenant_id: str, file_id: str, filename: str, content: bytes
    ) -> str:
        """ファイルをローカルディスクに保存し、`storage_url`を返す。

        Args:
            tenant_id: テナントID。
            file_id: ファイルID。
            filename: 元のファイル名。
            content: ファイルの内容（バイト列）。

        Returns:
            保存先を表す`file://`スキームのURL。
        """
        tenant_dir = self._root / tenant_id
        tenant_dir.mkdir(parents=True, exist_ok=True)
        # アップロードされたファイル名はクライアント（攻撃者）が任意に指定できるため、
        # `../`等のパス区切り文字を含んでいるとディレクトリトラバーサルによって
        # tenant_dir外への書き込みが可能になってしまう。`Path(...).name`でパス構造を
        # 除去し、ベース名のみを保存ファイル名に使用する。
        safe_filename = Path(filename).name
        target_path = tenant_dir / f"{file_id}_{safe_filename}"
        target_path.write_bytes(content)
        return f"file://{target_path.resolve()}"

    async def download(self, storage_url: str) -> bytes:
        """`storage_url`からファイルの内容を読み出す。

        Args:
            storage_url: `upload`が返した`file://`スキームのURL。

        Returns:
            ファイルの内容（バイト列）。

        Raises:
            FileNotFoundError: 保存先のファイルが存在しない場合。
        """
        path = self._storage_url_to_path(storage_url)
        return path.read_bytes()

    async def delete(self, storage_url: str) -> None:
        """`storage_url`が指すファイルを削除する。存在しない場合は何もしない。

        Args:
            storage_url: `upload`が返した`file://`スキームのURL。
        """
        path = self._storage_url_to_path(storage_url)
        path.unlink(missing_ok=True)

    @staticmethod
    def _storage_url_to_path(storage_url: str) -> Path:
        if not storage_url.startswith("file://"):
            raise ValueError(f"未対応のstorage_urlです: {storage_url}")
        return Path(storage_url.removeprefix("file://"))


def cleanup_storage_root(root: Path) -> None:
    """ストレージのルートディレクトリを丸ごと削除する（テスト用ユーティリティ）。"""
    shutil.rmtree(root, ignore_errors=True)


def get_file_storage() -> FileStorage:
    """`FileStorage`のDI用ファクトリ。設定された保存先ルートで`LocalFileStorage`を生成する。"""
    settings = get_settings()
    return LocalFileStorage(root=Path(settings.file_storage_root))


class S3FileStorage:
    """S3互換オブジェクトストレージを使ったファイルストレージ実装。

    ローカル環境ではLocalStack、本番相当環境では実AWS S3を想定し、
    `aioboto3`のクライアント生成時に渡す`endpoint_url`で向き先を切り替える。
    `{tenant_id}/{file_id}_{filename}`をキーとして保存し、`storage_url`には
    `s3://{bucket}/{key}`形式のURLを格納する。
    """

    def __init__(
        self,
        bucket_name: str,
        region_name: str,
        endpoint_url: str | None,
        aws_access_key_id: str | None,
        aws_secret_access_key: str | None,
    ) -> None:
        self._bucket_name = bucket_name
        self._session = aioboto3.Session()
        self._client_kwargs = {
            "region_name": region_name,
            "endpoint_url": endpoint_url,
            "aws_access_key_id": aws_access_key_id,
            "aws_secret_access_key": aws_secret_access_key,
        }

    async def upload(
        self, tenant_id: str, file_id: str, filename: str, content: bytes
    ) -> str:
        """ファイルをS3に保存し、`storage_url`を返す。

        Args:
            tenant_id: テナントID。
            file_id: ファイルID。
            filename: 元のファイル名。
            content: ファイルの内容（バイト列）。

        Returns:
            保存先を表す`s3://{bucket}/{key}`形式のURL。
        """
        # LocalFileStorageと同様、クライアントが任意に指定できるファイル名から
        # パス構造を除去し、ベース名のみをキーに使用する（パストラバーサル対策）。
        safe_filename = Path(filename).name
        key = f"{tenant_id}/{file_id}_{safe_filename}"
        async with self._session.client("s3", **self._client_kwargs) as client:
            await client.put_object(Bucket=self._bucket_name, Key=key, Body=content)
        return f"s3://{self._bucket_name}/{key}"

    async def download(self, storage_url: str) -> bytes:
        """`storage_url`からファイルの内容を読み出す。

        Args:
            storage_url: `upload`が返した`s3://{bucket}/{key}`形式のURL。

        Returns:
            ファイルの内容（バイト列）。

        Raises:
            FileNotFoundError: 保存先のオブジェクトが存在しない場合。
        """
        bucket, key = self._storage_url_to_bucket_and_key(storage_url)
        async with self._session.client("s3", **self._client_kwargs) as client:
            try:
                response = await client.get_object(Bucket=bucket, Key=key)
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") in (
                    "NoSuchKey",
                    "404",
                ):
                    raise FileNotFoundError(storage_url) from exc
                raise
            async with response["Body"] as body:
                return await body.read()

    async def delete(self, storage_url: str) -> None:
        """`storage_url`が指すオブジェクトを削除する。存在しない場合も何もしない扱いになる。

        Args:
            storage_url: `upload`が返した`s3://{bucket}/{key}`形式のURL。
        """
        bucket, key = self._storage_url_to_bucket_and_key(storage_url)
        async with self._session.client("s3", **self._client_kwargs) as client:
            await client.delete_object(Bucket=bucket, Key=key)

    @staticmethod
    def _storage_url_to_bucket_and_key(storage_url: str) -> tuple[str, str]:
        if not storage_url.startswith("s3://"):
            raise ValueError(f"未対応のstorage_urlです: {storage_url}")
        parsed = urlparse(storage_url)
        return parsed.netloc, parsed.path.lstrip("/")


def get_user_import_file_storage() -> FileStorage:
    """ユーザーインポート専用の`FileStorage`のDI用ファクトリ。

    ユーザーインポートはS3/SQSを使った非同期構成に移行済みのため、他機能（学習データ
    ファイル・インデックス）とは別に、常に`S3FileStorage`を返す専用のファクトリとする。

    Raises:
        RuntimeError: `AWS_S3_BUCKET_NAME`が未設定の場合。
    """
    aws_settings = get_aws_settings()
    if not aws_settings.aws_s3_bucket_name:
        raise RuntimeError(
            "AWS_S3_BUCKET_NAMEが設定されていません。"
            "ユーザーインポート機能を使うにはS3バケット名の設定が必要です。"
        )
    return S3FileStorage(
        bucket_name=aws_settings.aws_s3_bucket_name,
        region_name=aws_settings.aws_region,
        endpoint_url=aws_settings.aws_endpoint_url,
        aws_access_key_id=aws_settings.aws_access_key_id,
        aws_secret_access_key=aws_settings.aws_secret_access_key,
    )
