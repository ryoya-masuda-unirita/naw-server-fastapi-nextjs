import shutil
from pathlib import Path
from typing import Protocol

from app.core.config import get_settings


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
