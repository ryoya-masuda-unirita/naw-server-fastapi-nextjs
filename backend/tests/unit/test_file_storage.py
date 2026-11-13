from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from app.core.file_storage import LocalFileStorage, S3FileStorage


class TestLocalFileStorage:
    """LocalFileStorage のテスト"""

    class TestUpload:
        """アップロードのテスト"""

        async def test_upload_writes_file_under_tenant_directory(
            self, tmp_path: Path
        ) -> None:
            """通常のファイル名であればtenant_id配下に保存されること"""
            storage = LocalFileStorage(root=tmp_path)
            storage_url = await storage.upload(
                "tenant-1", "file-1", "report.pdf", b"content"
            )

            saved_path = Path(storage_url.removeprefix("file://"))
            assert saved_path.parent == (tmp_path / "tenant-1").resolve()
            assert saved_path.read_bytes() == b"content"

        async def test_upload_sanitizes_path_traversal_filename(
            self, tmp_path: Path
        ) -> None:
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
        """ダウンロードと削除のテスト"""

        async def test_download_and_delete_roundtrip(self, tmp_path: Path) -> None:
            """アップロードしたファイルをダウンロード・削除できること"""
            storage = LocalFileStorage(root=tmp_path)
            storage_url = await storage.upload("tenant-1", "file-1", "a.txt", b"data")

            assert await storage.download(storage_url) == b"data"

            await storage.delete(storage_url)
            with pytest.raises(FileNotFoundError):
                await storage.download(storage_url)


class _FakeS3Body:
    """S3 の get_object が返すボディを模したフェイク。"""

    def __init__(self, content: bytes) -> None:
        """ボディの内容を保持する。

        Parameters
        ----------
        content : bytes
            読み出し時に返すバイト列。
        """
        self._content = content

    async def __aenter__(self) -> "_FakeS3Body":
        """非同期コンテキストに入る。

        Returns
        -------
        _FakeS3Body
            自身。
        """
        return self

    async def __aexit__(self, *args: object) -> None:
        """非同期コンテキストを抜ける。何もしない。

        Parameters
        ----------
        args : object
            例外情報（使用しない）。

        Returns
        -------
        None
            常に None。
        """
        return None

    async def read(self) -> bytes:
        """保持しているバイト列を返す。

        Returns
        -------
        bytes
            ボディの内容。
        """
        return self._content


class _FakeS3Client:
    """`aioboto3`のS3クライアントを模した、インメモリ辞書に読み書きするフェイク。"""

    def __init__(self, objects: dict[tuple[str, str], bytes]) -> None:
        """保存先の辞書を受け取り、呼び出し履歴を初期化する。

        Parameters
        ----------
        objects : dict[tuple[str, str], bytes]
            (バケット名, キー) をキーとするオブジェクトの保存先。
        """
        self._objects = objects
        self.put_calls: list[tuple[str, str, bytes]] = []
        self.delete_calls: list[tuple[str, str]] = []

    async def __aenter__(self) -> "_FakeS3Client":
        """非同期コンテキストに入る。

        Returns
        -------
        _FakeS3Client
            自身。
        """
        return self

    async def __aexit__(self, *args: object) -> None:
        """非同期コンテキストを抜ける。何もしない。

        Parameters
        ----------
        args : object
            例外情報（使用しない）。

        Returns
        -------
        None
            常に None。
        """
        return None

    async def put_object(self, Bucket: str, Key: str, Body: bytes) -> None:
        """オブジェクトを辞書に保存し、呼び出しを記録する。

        Parameters
        ----------
        Bucket : str
            バケット名。
        Key : str
            オブジェクトキー。
        Body : bytes
            保存する内容。
        """
        self._objects[(Bucket, Key)] = Body
        self.put_calls.append((Bucket, Key, Body))

    async def get_object(self, Bucket: str, Key: str) -> dict:
        """オブジェクトを取得する。無ければ NoSuchKey の ClientError を送出する。

        Parameters
        ----------
        Bucket : str
            バケット名。
        Key : str
            オブジェクトキー。

        Returns
        -------
        dict
            Body に _FakeS3Body を持つ辞書。
        """
        try:
            content = self._objects[(Bucket, Key)]
        except KeyError:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey", "Message": "not found"}}, "GetObject"
            ) from None
        return {"Body": _FakeS3Body(content)}

    async def delete_object(self, Bucket: str, Key: str) -> None:
        """オブジェクトを削除し、呼び出しを記録する。

        Parameters
        ----------
        Bucket : str
            バケット名。
        Key : str
            オブジェクトキー。
        """
        self._objects.pop((Bucket, Key), None)
        self.delete_calls.append((Bucket, Key))


class _FakeS3Session:
    """S3 クライアントを返すだけの aioboto3 セッションのフェイク。"""

    def __init__(self, client: _FakeS3Client) -> None:
        """返すクライアントを保持する。

        Parameters
        ----------
        client : _FakeS3Client
            client() が返すフェイクのクライアント。
        """
        self._client = client

    def client(self, service_name: str, **kwargs: object) -> _FakeS3Client:
        """S3 のフェイククライアントを返す。

        Parameters
        ----------
        service_name : str
            サービス名。"s3" のみ許可する。
        kwargs : object
            クライアント生成時の追加引数（使用しない）。

        Returns
        -------
        _FakeS3Client
            保持しているフェイクのクライアント。
        """
        assert service_name == "s3"
        return self._client


class TestS3FileStorage:
    """S3FileStorage のテスト"""

    def _make_storage(self: object) -> tuple[S3FileStorage, _FakeS3Client]:
        """フェイクの S3 セッションに差し替えた S3FileStorage を作る。

        Parameters
        ----------
        self : object
            呼び出し元のテストクラスのインスタンス（使用しない）。

        Returns
        -------
        tuple[S3FileStorage, _FakeS3Client]
            ストレージとフェイクのクライアントの組。
        """
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
        """アップロードのテスト"""

        async def test_upload_calls_put_object_with_expected_bucket_and_key(
            self,
        ) -> None:
            """アップロード時に正しいバケット・キーでput_objectが呼び出されること"""
            storage, fake_client = TestS3FileStorage._make_storage(self)

            storage_url = await storage.upload(
                "tenant-1", "file-1", "report.pdf", b"content"
            )

            assert storage_url == "s3://test-bucket/tenant-1/file-1_report.pdf"
            assert fake_client.put_calls == [
                ("test-bucket", "tenant-1/file-1_report.pdf", b"content")
            ]

        async def test_upload_sanitizes_path_traversal_filename(self) -> None:
            """ファイル名にディレクトリトラバーサルを含んでいてもキーがサニタイズされること"""
            storage, _ = TestS3FileStorage._make_storage(self)

            storage_url = await storage.upload(
                "tenant-1", "file-1", "../../../../etc/evil.txt", b"malicious"
            )

            assert storage_url == "s3://test-bucket/tenant-1/file-1_evil.txt"

    class TestDownloadAndDelete:
        """ダウンロードと削除のテスト"""

        async def test_download_and_delete_roundtrip(self) -> None:
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
