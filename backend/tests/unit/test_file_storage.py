from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from app.core.file_storage import LocalFileStorage, S3FileStorage


class TestLocalFileStorage:
    class TestUpload:
        async def test_upload_writes_file_under_tenant_directory(self, tmp_path: Path):
            """通常のファイル名であればtenant_id配下に保存されること"""
            storage = LocalFileStorage(root=tmp_path)
            storage_url = await storage.upload(
                "tenant-1", "file-1", "report.pdf", b"content"
            )

            saved_path = Path(storage_url.removeprefix("file://"))
            assert saved_path.parent == (tmp_path / "tenant-1").resolve()
            assert saved_path.read_bytes() == b"content"

        async def test_upload_sanitizes_path_traversal_filename(self, tmp_path: Path):
            """ファイル名にディレクトリトラバーサルを含んでいてもtenant_id配下に保存されること"""
            storage = LocalFileStorage(root=tmp_path)
            storage_url = await storage.upload(
                "tenant-1", "file-1", "../../../../etc/evil.txt", b"malicious"
            )

            saved_path = Path(storage_url.removeprefix("file://"))
            tenant_dir = (tmp_path / "tenant-1").resolve()
            # 保存先はtenant_dir配下に留まり、ルートの外へ書き込まれていないこと
            assert tenant_dir in saved_path.parents or saved_path.parent == tenant_dir
            assert saved_path.parent == tenant_dir
            assert saved_path.name == "file-1_evil.txt"

    class TestDownloadAndDelete:
        async def test_download_and_delete_roundtrip(self, tmp_path: Path):
            """アップロードしたファイルをダウンロード・削除できること"""
            storage = LocalFileStorage(root=tmp_path)
            storage_url = await storage.upload("tenant-1", "file-1", "a.txt", b"data")

            assert await storage.download(storage_url) == b"data"

            await storage.delete(storage_url)
            with pytest.raises(FileNotFoundError):
                await storage.download(storage_url)


class _FakeS3Body:
    def __init__(self, content: bytes) -> None:
        self._content = content

    async def __aenter__(self) -> "_FakeS3Body":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def read(self) -> bytes:
        return self._content


class _FakeS3Client:
    """`aioboto3`のS3クライアントを模した、インメモリ辞書に読み書きするフェイク。"""

    def __init__(self, objects: dict[tuple[str, str], bytes]) -> None:
        self._objects = objects
        self.put_calls: list[tuple[str, str, bytes]] = []
        self.delete_calls: list[tuple[str, str]] = []

    async def __aenter__(self) -> "_FakeS3Client":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def put_object(self, Bucket: str, Key: str, Body: bytes) -> None:
        self._objects[(Bucket, Key)] = Body
        self.put_calls.append((Bucket, Key, Body))

    async def get_object(self, Bucket: str, Key: str) -> dict:
        try:
            content = self._objects[(Bucket, Key)]
        except KeyError:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey", "Message": "not found"}}, "GetObject"
            ) from None
        return {"Body": _FakeS3Body(content)}

    async def delete_object(self, Bucket: str, Key: str) -> None:
        self._objects.pop((Bucket, Key), None)
        self.delete_calls.append((Bucket, Key))


class _FakeS3Session:
    def __init__(self, client: _FakeS3Client) -> None:
        self._client = client

    def client(self, service_name: str, **kwargs: object) -> _FakeS3Client:
        assert service_name == "s3"
        return self._client


class TestS3FileStorage:
    def _make_storage(self) -> tuple[S3FileStorage, _FakeS3Client]:
        objects: dict[tuple[str, str], bytes] = {}
        fake_client = _FakeS3Client(objects)
        storage = S3FileStorage(
            bucket_name="test-bucket",
            region_name="ap-northeast-1",
            endpoint_url="http://localstack:4566",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        storage._session = _FakeS3Session(fake_client)
        return storage, fake_client

    class TestUpload:
        async def test_upload_calls_put_object_with_expected_bucket_and_key(self):
            """アップロード時に正しいバケット・キーでput_objectが呼び出されること"""
            storage, fake_client = TestS3FileStorage._make_storage(self)

            storage_url = await storage.upload(
                "tenant-1", "file-1", "report.pdf", b"content"
            )

            assert storage_url == "s3://test-bucket/tenant-1/file-1_report.pdf"
            assert fake_client.put_calls == [
                ("test-bucket", "tenant-1/file-1_report.pdf", b"content")
            ]

        async def test_upload_sanitizes_path_traversal_filename(self):
            """ファイル名にディレクトリトラバーサルを含んでいてもキーがサニタイズされること"""
            storage, _ = TestS3FileStorage._make_storage(self)

            storage_url = await storage.upload(
                "tenant-1", "file-1", "../../../../etc/evil.txt", b"malicious"
            )

            assert storage_url == "s3://test-bucket/tenant-1/file-1_evil.txt"

    class TestDownloadAndDelete:
        async def test_download_and_delete_roundtrip(self):
            """アップロードしたファイルをダウンロード・削除できること"""
            storage, fake_client = TestS3FileStorage._make_storage(self)
            storage_url = await storage.upload("tenant-1", "file-1", "a.txt", b"data")

            assert await storage.download(storage_url) == b"data"

            await storage.delete(storage_url)
            assert fake_client.delete_calls == [
                ("test-bucket", "tenant-1/file-1_a.txt")
            ]
            with pytest.raises(FileNotFoundError):
                await storage.download(storage_url)
