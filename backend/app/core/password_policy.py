import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password_async
from app.models.tenant import Tenant
from app.repositories.password_history_repository import PasswordHistoryRepository


def _policy_error(message: str) -> HTTPException:
    """パスワードポリシー違反を表す 400 の例外を生成する。

    Args:
        message: クライアントに返すエラーメッセージ。

    Returns:
        ステータス 400 の HTTPException。
    """
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def verify_password_strength(new_password: str, tenant: Tenant) -> None:
    """新パスワードがテナントのパスワードポリシーを満たすか検証する。

    移植元の PasswordPolicy.validate と同じ順序で検証し、最初に満たさなかった
    項目のメッセージを返す。文字種の判定は Java の Character.isUpperCase /
    isLowerCase / isDigit に合わせて Unicode の文字カテゴリで行う。

    Args:
        new_password: 検証対象の新パスワード。
        tenant: パスワードポリシーを持つテナント。

    Raises:
        HTTPException: 空白のみ・最小長未満・必須の文字種（大文字/小文字/数字/記号）を
            含まない場合 400 を返す。
    """
    if not new_password.strip():
        raise _policy_error("新パスワードの入力は必須です。")
    if len(new_password) < tenant.pw_policy_min_length:
        raise _policy_error(
            f"新パスワードは{tenant.pw_policy_min_length}文字以上で入力してください。"
        )
    if tenant.pw_policy_use_uppercase and not any(c.isupper() for c in new_password):
        raise _policy_error("新パスワードには大文字を含めてください。")
    if tenant.pw_policy_use_lowercase and not any(c.islower() for c in new_password):
        raise _policy_error("新パスワードには小文字を含めてください。")
    # isdigit() は上付き数字なども含むため、Java の isDigit と同じ Nd カテゴリの isdecimal() を使う
    if tenant.pw_policy_use_digits and not any(c.isdecimal() for c in new_password):
        raise _policy_error("新パスワードには数字を含めてください。")
    if tenant.pw_policy_use_symbols:
        valid_symbols = tenant.pw_policy_valid_symbols
        if not valid_symbols:
            raise _policy_error("新パスワードの記号要件を満たせません。")
        if not any(c in valid_symbols for c in new_password):
            raise _policy_error(
                f"新パスワードには次の記号のいずれかを含めてください: {valid_symbols}"
            )


async def check_password_not_reused(
    user_id: uuid.UUID,
    new_password: str,
    tenant: Tenant,
    session: AsyncSession,
) -> None:
    """新パスワードが直近の使用履歴に含まれていないか検証する。

    Args:
        user_id: 検証対象ユーザーのID。
        new_password: 検証対象の新パスワード。
        tenant: パスワード履歴件数のポリシーを持つテナント。
        session: 非同期DBセッション。

    Raises:
        HTTPException: 直近の使用履歴に含まれる場合 400 を返す。
    """
    recent_hashes = await PasswordHistoryRepository.get_recent_hashes(
        user_id, tenant.pw_histories_limit, session
    )
    for hashed in recent_hashes:
        if await verify_password_async(new_password, hashed):
            # 移植元 PasswordResetService.SAME_PASSWORD_MESSAGE と同じ文言にする
            raise _policy_error(
                "新パスワードは過去のパスワードと異なるものを設定してください。"
            )
