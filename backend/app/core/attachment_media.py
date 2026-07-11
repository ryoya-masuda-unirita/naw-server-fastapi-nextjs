"""添付ファイルをLLM(Azure OpenAI Chat Completions API)入力のコンテンツへ変換する。

移植元(Spring Boot)は画像ファイルをマルチモーダルの画像パートとして埋め込み、非画像
ファイル(PDF等)はApache Tikaでテキスト抽出してプロンプトに埋め込む。本ポートでは
Tika相当のテキスト抽出ライブラリが未導入のため、非画像ファイルのテキスト抽出は
Issue #97のスコープ外とし、ファイルが存在する旨のみ本文に付記する
(`docs/issue-97/01_要件定義.md`参照)。

`llm_chat_service.py`・`message_service.py`の双方から呼び出す共通のインフラ層の
純粋関数のため、「serviceが別serviceを呼ばない」規約に抵触しない`core/`に配置する。
"""

import base64

from app.schemas.attachment import AttachmentFile

IMAGE_CONTENT_TYPE_PREFIX = "image/"


def build_user_content(
    text: str, files: list[AttachmentFile]
) -> str | list[dict[str, object]]:
    """ユーザー発話本文と添付ファイルから、Chat Completions API向けのcontentを組み立てる。

    Args:
        text: ユーザー発話の本文。
        files: 添付ファイル一覧。

    Returns:
        添付ファイルが存在しない場合は`text`をそのまま返す。存在する場合は、
        テキストパートと画像パート(画像ファイルのみ)からなるリストを返す。
    """
    if not files:
        return text

    image_files = [f for f in files if f.type.startswith(IMAGE_CONTENT_TYPE_PREFIX)]
    other_files = [f for f in files if not f.type.startswith(IMAGE_CONTENT_TYPE_PREFIX)]

    body = text
    if other_files:
        names = "、".join(f.name for f in other_files)
        body = (
            f"{text}\n\n"
            f"(添付ファイル: {names} は画像以外のためテキスト抽出未対応です。"
            "本文には反映されていません)"
        )

    parts: list[dict[str, object]] = [{"type": "text", "text": body}]
    for image_file in image_files:
        encoded = base64.b64encode(image_file.data).decode("ascii")
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{image_file.type};base64,{encoded}"},
            }
        )
    return parts
