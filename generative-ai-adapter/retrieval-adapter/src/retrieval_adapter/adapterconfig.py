"""Waha! のプロパティの値を持つ入れ物（移植元 adapterconfig パッケージ）。

`RetrievalProviderProperties`（埋め込みプロバイダ・リランクのプロバイダ）・
`RetrievalNetworkProperties`（プロキシ・SSL）・`RetrievalVectorDbProperties`（ベクトルDB）。
可変で、アダプタ境界（`mapper`）で core の不変な設定に変える。
"""

from dataclasses import dataclass

from generative_ai_core.resource import (
    CoreDerivedResourceNameResolver,
    CoreDerivedResourceTargetKind,
)

DEFAULT_TIMEOUT_SECONDS = 180
NO_PORT = -1
AZURE_SEARCH_PROVIDER_NAMES = ("Azure AI Search", "AzureOpenAI")
POSTGRESQL_PROVIDER_NAMES = ("PostgreSQL(PGVector)", "PostgreSQL", "PGvector")


@dataclass
class RetrievalProviderProperties:
    """埋め込み（またはリランク）のプロバイダのプロパティ。

    Attributes
    ----------
    url : str | None
        プロバイダの URL。
    test_url : str | None
        接続テスト用の URL。
    api_key : str | None
        API キー。
    secuaigent_access_token : str | None
        SecuAiGent のアクセストークン（textData から上書きされる）。
    model_name : str | None
        モデル名。
    vendor_name : str | None
        ベンダー名（`OpenAI`・`AzureOpenAI`・`SecuAiGent` など）。
    tenant_id : str | None
        テナント ID（SecuAiGent）。
    secuaigent_stream_file_path : str | None
        SecuAiGent の途中経過ファイル。
    embedding_dimensions : int | None
        埋め込みの次元数。
    timeout_seconds : int
        タイムアウト秒。
    secuaigent_message_id : str | None
        SecuAiGent のメッセージ ID。
    secuaigent_additional_prompt : str | None
        SecuAiGent の追加プロンプト。
    secuaigent_create_library : bool | None
        SecuAiGent のライブラリ生成。
    """

    url: str | None = None
    test_url: str | None = None
    api_key: str | None = None
    secuaigent_access_token: str | None = None
    model_name: str | None = None
    vendor_name: str | None = None
    tenant_id: str | None = None
    secuaigent_stream_file_path: str | None = None
    embedding_dimensions: int | None = None
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    secuaigent_message_id: str | None = None
    secuaigent_additional_prompt: str | None = None
    secuaigent_create_library: bool | None = None

    def copy(self) -> "RetrievalProviderProperties":
        """項目をそのまま写した新しいオブジェクトを返す。

        Returns
        -------
        RetrievalProviderProperties
            写し。
        """
        return RetrievalProviderProperties(**vars(self))


@dataclass
class RetrievalNetworkProperties:
    """プロキシ・SSL のプロパティ。

    Attributes
    ----------
    use_proxy : int
        0=なし、1=手動、2=システム。
    proxy_host : str | None
        プロキシのホスト名。
    proxy_port : int
        プロキシのポート。未指定は -1。
    use_proxy_cred : bool
        プロキシ認証を使うか。
    proxy_id : str | None
        プロキシ認証のユーザー。
    proxy_pass : str | None
        プロキシ認証のパスワード。
    insecure_ssl_enabled : bool
        SSL 証明書の検証を無効にするか。
    """

    use_proxy: int = 0
    proxy_host: str | None = None
    proxy_port: int = 0
    use_proxy_cred: bool = False
    proxy_id: str | None = None
    proxy_pass: str | None = None
    insecure_ssl_enabled: bool = False


@dataclass
class RetrievalVectorDbProperties:
    """ベクトルDB のプロパティ。

    Attributes
    ----------
    vendor_name : str | None
        ベクトルDB（`Azure AI Search`・`PostgreSQL(PGVector)` など）。
    url : str | None
        Azure AI Search の URL、または PostgreSQL の `host[:port]`。
    api_key : str | None
        Azure AI Search の API キー。
    index_name : str | None
        インデックス名。
    user_name : str | None
        PostgreSQL のユーザー。
    password : str | None
        PostgreSQL のパスワード。
    database_name : str | None
        PostgreSQL のデータベース名。
    table_name : str | None
        PostgreSQL のテーブル名。
    new_creation : bool
        スキーマを作るか（検索では使わない）。
    graph_write_enabled : bool
        Graph への書き込みが有効か。
    graph_name : str | None
        AGE graph 名。
    """

    vendor_name: str | None = None
    url: str | None = None
    api_key: str | None = None
    index_name: str | None = None
    user_name: str | None = None
    password: str | None = None
    database_name: str | None = None
    table_name: str | None = None
    new_creation: bool = False
    graph_write_enabled: bool = False
    graph_name: str | None = None

    def _is_provider(self, names: tuple[str, ...]) -> bool:
        """ベクトルDB の名前が、指定の名前のどれかかを返す（大文字小文字は無視）。

        Parameters
        ----------
        names : tuple[str, ...]
            名前の候補。

        Returns
        -------
        bool
            一致すれば True。
        """
        if self.vendor_name is None:
            return False
        vendor = self.vendor_name.strip().lower()
        return any(name.lower() == vendor for name in names)

    def is_azure_search_provider(self) -> bool:
        """Azure AI Search かを返す。

        Returns
        -------
        bool
            そうなら True。
        """
        return self._is_provider(AZURE_SEARCH_PROVIDER_NAMES)

    def is_postgresql_provider(self) -> bool:
        """PostgreSQL（pgvector）かを返す。

        Returns
        -------
        bool
            そうなら True。
        """
        return self._is_provider(POSTGRESQL_PROVIDER_NAMES)

    def get_effective_graph_name(self) -> str:
        """AGE graph 名（明示がなければテーブル名から導出）を返す。

        Returns
        -------
        str
            graph 名。

        Raises
        ------
        ValueError
            テーブル名がない、または名前が安全でないとき。
        """
        return CoreDerivedResourceNameResolver().resolve(
            self.table_name, CoreDerivedResourceTargetKind.AGE_GRAPH, self.graph_name
        )

    def get_effective_index_name(self) -> str:
        """インデックス名（明示がなければテーブル名から導出）を返す。

        Returns
        -------
        str
            インデックス名。

        Raises
        ------
        ValueError
            テーブル名がない、または名前が安全でないとき。
        """
        kind = (
            CoreDerivedResourceTargetKind.AZURE_SEARCH_INDEX
            if self.is_azure_search_provider()
            else CoreDerivedResourceTargetKind.POSTGRES_INDEX
        )
        return CoreDerivedResourceNameResolver().resolve(
            self.table_name, kind, self.index_name
        )
