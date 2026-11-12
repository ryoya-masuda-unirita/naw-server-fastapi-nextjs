from datetime import datetime
from enum import StrEnum

from sqlalchemy import Column, DateTime, ForeignKey, Index, LargeBinary, String, Text
from sqlmodel import Field, SQLModel

from app.core.jsonutil import column_to_string_list, string_list_to_column, utcnow


class MessageContentStatus(StrEnum):
    """メッセージ内容の生成結果の状態（移植元 MessageContent.Status）。

    DB には名前の文字列（`OK` / `ERROR`）で保存する。Waha! での生成に失敗した場合も
    レコードを `ERROR` で残し、後から結果を参照できるようにしている。
    """

    OK = "OK"
    ERROR = "ERROR"


class MessageContent(SQLModel, table=True):
    """移植元 MessageContent（message_contents テーブル）。"""

    __tablename__ = "message_contents"
    __table_args__ = (
        Index("message_contents_message_id_idx", "message_id"),
        Index("message_contents_created_at_idx", "id", "created_at"),
    )

    id: str = Field(sa_column=Column(String(32), primary_key=True))
    message_id: str = Field(sa_column=Column(String(32), nullable=False, unique=True))
    status: str = Field(sa_column=Column(String(32), nullable=False))
    question: str = Field(sa_column=Column(Text, nullable=False))
    answer: str = Field(sa_column=Column(Text, nullable=False))
    context: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    file_paths: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    @property
    def reference_file_paths(self) -> list[str] | None:
        """回答の参照元ファイルパスを一覧で返す。

        DB にはセパレータで連結した文字列で保存しているため、移植元
        StringListConverter と同じ規則で分割して返す。

        Returns
        -------
        list[str] | None
            参照元ファイルパスの一覧。保存値が空のときは None（移植元と同じく null）。
        """
        return column_to_string_list(self.file_paths)

    def set_reference_file_paths(self, paths: list[str] | None) -> None:
        """回答の参照元ファイルパスを DB 保存用の文字列にして設定する。

        移植元 setReferenceFilePaths と同じく、空や None なら空文字列を保存する。

        Parameters
        ----------
        paths : list[str] | None
            参照元ファイルパスの一覧。
        """
        # 移植元 setReferenceFilePaths と同じく、空なら空文字列を保存する
        self.file_paths = string_list_to_column(paths)

    def touch(self) -> None:
        """更新日時を現在時刻（UTC）にする。

        移植元の @PreUpdate による自動更新の代わりに、更新処理から明示的に呼ぶ。
        """
        self.updated_at = utcnow()


class MessageContentFile(SQLModel, table=True):
    """移植元 MessageContentFile（message_content_files テーブル）。"""

    __tablename__ = "message_content_files"

    id: str = Field(sa_column=Column(String(32), primary_key=True))
    message_content_id: str = Field(
        sa_column=Column(
            String(32),
            ForeignKey(
                "message_contents.id",
                name="fk_message_content_files_message_content_id",
                ondelete="CASCADE",
            ),
            nullable=False,
        )
    )
    name: str = Field(sa_column=Column(String(256), nullable=False))
    type: str = Field(sa_column=Column(String(128), nullable=False))
    data: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
