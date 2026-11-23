from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.core.library_tag_id import normalize_library_tag_id, normalize_library_tag_ids


class TestNormalizeLibraryTagId:
    """normalize_library_tag_id のテスト"""

    def test_normalize_keeps_stored_format(self) -> None:
        """保存形式（ハイフンなし32桁）はそのまま返ること"""
        tag_id = uuid4().hex

        assert normalize_library_tag_id(tag_id) == tag_id

    def test_normalize_hyphenated_id(self) -> None:
        """UUID標準形式（ハイフン付き）はハイフンなしに揃うこと"""
        tag_uuid = uuid4()

        assert normalize_library_tag_id(str(tag_uuid)) == tag_uuid.hex

    def test_normalize_uppercase_hyphenated_id(self) -> None:
        """大文字のハイフン付きは小文字のハイフンなしに揃うこと"""
        tag_uuid = uuid4()

        assert normalize_library_tag_id(str(tag_uuid).upper()) == tag_uuid.hex

    @pytest.mark.parametrize(
        "tag_id",
        [
            "urn:uuid:12345678-1234-5678-1234-567812345678",
            "{12345678-1234-5678-1234-567812345678}",
            "1234567812345678123456781234567",
            "1-2-3-4-5",
            "zzzzzzzz-1234-5678-1234-567812345678",
            "nonexistent",
            "",
            " 12345678123456781234567812345678",
            "12345678-1234-5678-1234-567812345678\n",
        ],
    )
    def test_normalize_rejects_invalid_formats(self, tag_id: str) -> None:
        """保存形式・UUID標準形式以外の表記はNoneになること"""
        assert normalize_library_tag_id(tag_id) is None


class TestNormalizeLibraryTagIds:
    """normalize_library_tag_ids のテスト"""

    def test_normalize_ids_keeps_order(self) -> None:
        """表記の混在した一覧が順序を保って保存形式に揃うこと"""
        first, second, third = uuid4(), uuid4(), uuid4()

        result = normalize_library_tag_ids([str(first), second.hex, str(third).upper()])

        assert result == [first.hex, second.hex, third.hex]

    def test_normalize_ids_keeps_duplicates(self) -> None:
        """重複は除かないこと（重複除去は呼び出し側で行う）"""
        tag_uuid = uuid4()

        result = normalize_library_tag_ids([tag_uuid.hex, str(tag_uuid)])

        assert result == [tag_uuid.hex, tag_uuid.hex]

    def test_normalize_ids_with_invalid_id_raises_400(self) -> None:
        """不正な形式のIDを含むと400になり、メッセージに値が入ること"""
        with pytest.raises(HTTPException) as exc_info:
            normalize_library_tag_ids([str(UUID(int=1)), "bad"])

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "Invalid UUID string: bad"

    def test_normalize_ids_with_too_long_id_omits_value(self) -> None:
        """37文字以上の不正なIDは、値を含めず移植元と同じ文言で400になること"""
        with pytest.raises(HTTPException) as exc_info:
            normalize_library_tag_ids(["x" * 37])

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "UUID string too large"
