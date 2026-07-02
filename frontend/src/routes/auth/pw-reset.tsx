import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { MdLockReset } from 'react-icons/md';
import { useAuthStore } from '@/store/auth-store';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { FormInput } from '@/components/shared/form-input';
import { Button } from '@/components/shared/button';
import { useResetPasswordMutation } from '@/hooks/use-reset-password';

export function PwResetPage() {
  const { t } = useTranslation();
  const { completePasswordReset } = useAuthStore();
  const mutation = useResetPasswordMutation();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState(() => searchParams.get('username') ?? '');
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
  const [error, setError] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPasswordMismatch(false);

    if (newPassword !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }

    try {
      const response = await mutation.mutateAsync({
        username,
        oldPassword,
        newPassword,
      });
      await completePasswordReset(response);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('429')) {
          setError(t('AUTH.LOGIN.PASSWORD_RATELIMIT'));
        } else {
          setError(err.message);
        }
      }
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-6">
        <header className="flex flex-col gap-2 py-[10.5px]">
          <h1 className="text-h1 text-text-default">{t('AUTH.PW_RESET.TITLE')}</h1>
          {reason === 'INITIAL' && (
            <p className="text-sm text-text-medium">{t('AUTH.PW_RESET.REASON_INITIAL')}</p>
          )}
          {reason === 'EXPIRED' && (
            <p className="text-sm text-text-medium">{t('AUTH.PW_RESET.REASON_EXPIRED')}</p>
          )}
        </header>

        {error && (
          <div className="rounded bg-bg-error px-3 py-2 text-xs text-status-error">
            {error}
          </div>
        )}

        <FormInput
          id="username"
          label={t('AUTH.PW_RESET.USER_ID_LABEL')}
          value={username}
          onChange={setUsername}
          disabled={mutation.isPending}
          required
          autoComplete="username"
        />

        <FormInput
          id="oldPassword"
          label={t('AUTH.PW_RESET.OLD_PASSWORD_LABEL')}
          type="password"
          value={oldPassword}
          onChange={setOldPassword}
          disabled={mutation.isPending}
          required
          autoComplete="current-password"
        />

        <FormInput
          id="newPassword"
          label={t('AUTH.PW_RESET.NEW_PASSWORD_LABEL')}
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          disabled={mutation.isPending}
          required
          autoComplete="new-password"
        />

        <FormInput
          id="confirmPassword"
          label={t('AUTH.PW_RESET.CONFIRM_PASSWORD_LABEL')}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          disabled={mutation.isPending}
          required
          autoComplete="new-password"
          error={passwordMismatch ? t('VALIDATION.PASSWORD_MISMATCH') : undefined}
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
