from pydantic import Base64Bytes, BaseModel, Field


class AttachmentFile(BaseModel):
    """メッセージ送信時にクライアントから渡す添付ファイル1件。

    移植元(Spring Boot)は`multipart/form-data`でファイルを受け取るが、本ポートでは
    他のリクエスト(`LlmChatRequest`・`MessageContentCreateRequest`とも純粋なJSON
    ボディ)との一貫性を優先し、JSONボディ内でBase64エンコードして受け取る。

    `data`は、画像等の任意バイナリをJSON文字列として安全に運ぶため、素の`bytes`
    ではなくPydantic v2の`Base64Bytes`型を使う（素の`bytes`はUTF-8としてそのまま
    エンコード/デコードされるだけでBase64変換は行われないため、バイナリ安全でない）。
    `Base64Bytes`はJSON入出力の双方でBase64エンコード文字列として扱い、Pythonの
    属性値としてはデコード後の生バイト列を保持する。
    """

    name: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=128)
    data: Base64Bytes
