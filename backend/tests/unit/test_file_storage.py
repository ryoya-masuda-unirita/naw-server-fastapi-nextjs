from pathlib import Path

import pytest

from app.core.file_storage import LocalFileStorage


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
