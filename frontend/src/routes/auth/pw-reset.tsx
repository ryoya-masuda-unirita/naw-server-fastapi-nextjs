import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MdLockReset } from 'react-icons/md';
import { useAuthStore } from '@/store/auth-store';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { FormInput } from '@/components/shared/form-input';
import { Button } from '@/components/shared/button';
import { useToastStore } from '@/components/shared/toast-store';
import { useResetPasswordMutation } from '@/hooks/use-reset-password';
import { ApiError } from '@/lib/api-client';
import { ROUTES } from '@/lib/constants/routes';
import { PASSWORD_MAX_LENGTH } from '@/lib/constants/validation';
import { validatePasswordField, validateRequiredField } from '@/lib/utils/auth-validation';

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

type PwResetField = 'oldPassword' | 'newPassword' | 'confirmPassword';

/**
 * API のエラー本文から message を取り出す（移植元 `err.error?.message`）。
 *
 * Parameters
 * ----------
 * err : ApiError
 *     API が返したエラー。
 *
 * Returns
 * -------
 * string
 *     本文の message。なければ空文字。
 */
function extractErrorMessage(err: ApiError): string {
  const body = err.body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export function PwResetPage() {
  const { t } = useTranslation();
  const { completePasswordReset, user } = useAuthStore();
  const mutation = useResetPasswordMutation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 移植元と同じく、ログインID欄は編集できない。値は URL、なければログイン中のユーザーの ID
  const [username] = useState(() => searchParams.get('username') || user?.id || '');
  const [oldPassword, setOldPassword] = useState(() => {
    // sessionStorage 経由で受け取る（URL 露出防止）、テスト用に URL フォールバックも保持
    const stored = sessionStorage.getItem('PW_RESET_OLD_PASSWORD');
    if (stored) {
      sessionStorage.removeItem('PW_RESET_OLD_PASSWORD');
      return stored;
    }
    return searchParams.get('oldPassword') ?? '';
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reason] = useState<'INITIAL' | 'EXPIRED' | null>(
    () => searchParams.get('reason') as 'INITIAL' | 'EXPIRED' | null
  );
  // 移植元の submitError（ログインID欄の下）と newPasswordSubmitError（新パスワード欄の下）
  const [submitError, setSubmitError] = useState('');
  const [newPasswordSubmitError, setNewPasswordSubmitError] = useState('');
  // 移植元 Angular のフォームと同じく、触れた（blur・送信済み）欄だけエラーを出す
  const [touched, setTouched] = useState<Record<PwResetField, boolean>>({
    oldPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  // 新パスワードと再入力が違えば（両方空は除く）再入力欄に出す。必須より優先する（移植元 pwResetPasswordMatchValidator）
  const isMismatch = (newPassword !== '' || confirmPassword !== '') && newPassword !== confirmPassword;
  const fieldErrors: Record<PwResetField, string> = {
    oldPassword: validateRequiredField(oldPassword, t),
    newPassword: validatePasswordField(newPassword, t),
    confirmPassword: isMismatch
      ? t('VALIDATION.PASSWORD_MISMATCH')
      : validatePasswordField(confirmPassword, t),
  };
  const visibleError = (field: PwResetField) => (touched[field] ? fieldErrors[field] : '');
  const touch = (field: PwResetField) => setTouched((prev) => ({ ...prev, [field]: true }));
  const clearSubmitErrors = () => {
    setSubmitError('');
    setNewPasswordSubmitError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ oldPassword: true, newPassword: true, confirmPassword: true });
    if (Object.values(fieldErrors).some(Boolean)) return;

    setSubmitError('');
    try {
      const response = await mutation.mutateAsync({
        username,
        oldPassword,
        newPassword,
      });
      useToastStore.getState().success(t('AUTH.PW_RESET.SUCCESS'));
      await completePasswordReset(response);
      // ページを読み込み直すとトーストが消えるため、移植元と同じくルーターで遷移する
      navigate(ROUTES.APP.DASHBOARD);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('Password reset failed', err);
        return;
      }
      if (err.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
        setSubmitError(t('AUTH.LOGIN.PASSWORD_RATELIMIT'));
        return;
      }
      // 400 はパスワードポリシー違反など新パスワードに関するエラーのため、ログインID欄ではなく新パスワード欄に出す
      if (err.status === HTTP_STATUS_BAD_REQUEST) {
        setNewPasswordSubmitError(extractErrorMessage(err));
        return;
      }
      setSubmitError(extractErrorMessage(err));
    }
  };

  return (
    <AuthLayout>
      {/* ブラウザ標準の吹き出しではなく、移植元と同じ欄の下の文言で入力チェックを出す */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 md:gap-6">
        <header className="flex flex-col gap-2 py-[10.5px]">
          <h1 className="text-h1 text-text-default">{t('AUTH.PW_RESET.TITLE')}</h1>
          {reason === 'INITIAL' && (
            <p className="text-sm text-text-medium">{t('AUTH.PW_RESET.REASON_INITIAL')}</p>
          )}
          {reason === 'EXPIRED' && (
            <p className="text-sm text-text-medium">{t('AUTH.PW_RESET.REASON_EXPIRED')}</p>
          )}
        </header>

        <FormInput
          id="username"
          label={t('AUTH.PW_RESET.USER_ID_LABEL')}
          value={username}
          error={submitError}
          disabled
          autoComplete="username"
        />

        <FormInput
          id="oldPassword"
          label={t('AUTH.PW_RESET.OLD_PASSWORD_LABEL')}
          type="password"
          showPasswordToggle
          value={oldPassword}
          onChange={(v) => { setOldPassword(v); clearSubmitErrors(); }}
          onFormBlur={() => touch('oldPassword')}
          error={visibleError('oldPassword')}
          disabled={mutation.isPending}
          autoComplete="current-password"
        />

        <FormInput
          id="newPassword"
          label={t('AUTH.PW_RESET.NEW_PASSWORD_LABEL')}
          type="password"
          showPasswordToggle
          value={newPassword}
          onChange={(v) => { setNewPassword(v); clearSubmitErrors(); }}
          onFormBlur={() => touch('newPassword')}
          error={newPasswordSubmitError || visibleError('newPassword')}
          maxLength={PASSWORD_MAX_LENGTH}
          asciiOnly
          disabled={mutation.isPending}
          autoComplete="new-password"
        />

        <FormInput
          id="confirmPassword"
          label={t('AUTH.PW_RESET.CONFIRM_PASSWORD_LABEL')}
          type="password"
          showPasswordToggle
          value={confirmPassword}
          onChange={(v) => { setConfirmPassword(v); clearSubmitErrors(); }}
          onFormBlur={() => touch('confirmPassword')}
          error={visibleError('confirmPassword')}
          maxLength={PASSWORD_MAX_LENGTH}
          asciiOnly
          disabled={mutation.isPending}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={mutation.isPending}
          loading={mutation.isPending}
        >
          <MdLockReset className="size-5 shrink-0" />
          {t('AUTH.PW_RESET.SUBMIT')}
        </Button>
      </form>
    </AuthLayout>
  );
}
