"""移植元 CoreFailureSanitizerTest の移植。"""

from generative_ai_core.failure import (
    BLANK_SUMMARY,
    DEFAULT_FAILURE_CODE,
    CoreFailure,
    sanitize,
)


def test_redacts_provider_and_proxy_secrets_from_failure_text() -> None:
    """プロバイダ・プロキシの秘密情報が伏せられること"""
    raw = (
        "Authorization: Bearer bearer-secret api_key=sk-secret "
        "proxy_pass=proxySecret credentialRef=/secure/team/key.json "
        "endpoint=https://user:password@provider.example.invalid/v1"
    )

    sanitized = sanitize(raw)

    for expected in (
        "Bearer [REDACTED]",
        "api_key=[REDACTED]",
        "proxy_pass=[REDACTED]",
        "credentialRef=[REDACTED]",
        "endpoint=[REDACTED]",
    ):
        assert expected in sanitized
    for secret in (
        "bearer-secret",
        "sk-secret",
        "proxySecret",
        "/secure/team/key.json",
        "user:password",
    ):
        assert secret not in sanitized


def test_redacts_tool_raw_assignments_from_failure_text() -> None:
    """tools の生の設定値が伏せられること"""
    raw = (
        "tool_name=web_search server_label=internal-mcp "
        "server_url=https://mcp.example.invalid/sse require_approval=never"
    )

    sanitized = sanitize(raw)

    for expected in (
        "tool_name=[REDACTED]",
        "server_label=[REDACTED]",
        "server_url=[REDACTED]",
        "require_approval=[REDACTED]",
    ):
        assert expected in sanitized
    for secret in ("web_search", "internal-mcp", "mcp.example.invalid", "never"):
        assert secret not in sanitized


def test_preserves_safe_hyphenated_slugs_containing_open_ai_like_substring() -> None:
    """sk- を途中に含むだけの安全な文字列は伏せられないこと"""
    raw = (
        "label_hash=desk-area candidate_id=support-desk "
        "zone=office-zone-1 sketch=sketch-area"
    )

    sanitized = sanitize(raw)

    for safe in ("desk-area", "support-desk", "office-zone-1", "sketch-area"):
        assert safe in sanitized
    assert "[REDACTED]" not in sanitized


def test_redacts_standalone_open_ai_like_key_without_redacting_safe_slug() -> None:
    """単独の sk- キーは伏せ、安全な文字列は残すこと"""
    sanitized = sanitize("label_hash=desk-area leaked sk-live-secret-123")

    assert "desk-area" in sanitized
    assert "[REDACTED]" in sanitized
    assert "sk-live-secret-123" not in sanitized


def test_redacts_separator_prefixed_open_ai_like_keys_without_redacting_slug() -> None:
    """区切り文字の後ろの sk- キーは伏せ、安全な文字列は残すこと"""
    raw = (
        "label_hash=desk-area tenant:sk-live-secret-123 "
        "host.foo.sk-dot-secret-123 host.foo_sk-underscore-secret-123 "
        "host.foo-sk-hyphen-secret-123"
    )

    sanitized = sanitize(raw)

    assert "desk-area" in sanitized
    for secret in (
        "sk-live-secret-123",
        "sk-dot-secret-123",
        "sk-underscore-secret-123",
        "sk-hyphen-secret-123",
    ):
        assert secret not in sanitized
    assert "[REDACTED]" in sanitized


def test_blank_failure_fields_fall_back_to_safe_defaults() -> None:
    """空のコード・要約は既定のコードと Runtime failure. になること"""
    failure = CoreFailure.of(" ", None)

    assert failure.code == DEFAULT_FAILURE_CODE
    assert failure.summary == BLANK_SUMMARY
    assert sanitize(None) == BLANK_SUMMARY
