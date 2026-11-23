from pydantic import Base64Bytes, BaseModel, Field


class AttachmentFile(BaseModel):
    """メッセージ送信時にクライアントから渡す添付ファイル1件。

    移植元(Spring Boot)は`multipart/form-data`でファイルを受け取る。本ポートも、
    メッセージ送信API(`MessageContentCreateRequest`、issue-182)・LLMチャットAPI
    (`LlmChatRequest`、issue-224)ともに移植元と同じくmultipartで受け取り、
    `parse_text_data_form`でファイルパートを本クラスへ変換する。

    `data`は、画像等の任意バイナリをJSON文字列として安全に運ぶため、素の`bytes`
    ではなくPydantic v2の`Base64Bytes`型を使う（素の`bytes`はUTF-8としてそのまま
    エンコード/デコードされるだけでBase64変換は行われないため、バイナリ安全でない）。
    `Base64Bytes`はJSON入出力の双方でBase64エンコード文字列として扱い、Pythonの
    属性値としてはデコード後の生バイト列を保持する。
    """

    name: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=128)
    data: Base64Bytes
