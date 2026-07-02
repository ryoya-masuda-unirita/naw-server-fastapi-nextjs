import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth-store';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { useResetPasswordMutation } from '@/hooks/use-reset-password';

export function PwResetPage() {
  const { t } = useTranslation();
  const { completePasswordReset } = useAuthStore();
  const mutation = useResetPasswordMutation();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState(() => searchParams.get('username') ?? '');
  const [oldPassword, setOldPassword] = useState(() => searchParams.get('oldPassword') ?? '');
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
      completePasswordReset(response);
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
        <header className="flex items-center py-[10.5px]">
          <h1 className="text-2xl font-bold">{t('AUTH.PW_RESET.TITLE')}</h1>
        </header>

        {reason === 'INITIAL' && (
          <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {t('AUTH.PW_RESET.REASON_INITIAL')}
          </div>
        )}
        {reason === 'EXPIRED' && (
          <div className="rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
            {t('AUTH.PW_RESET.REASON_EXPIRED')}
          </div>
        )}

        {error && (
          <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('AUTH.PW_RESET.USER_ID_LABEL')}</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={mutation.isPending}
            required
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('AUTH.PW_RESET.OLD_PASSWORD_LABEL')}</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            disabled={mutation.isPending}
            required
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('AUTH.PW_RESET.NEW_PASSWORD_LABEL')}</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={mutation.isPending}
            required
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('AUTH.PW_RESET.CONFIRM_PASSWORD_LABEL')}</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={mutation.isPending}
            required
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          />
          {passwordMismatch && (
            <p className="text-xs text-red-600">{t('VALIDATION.PASSWORD_MISMATCH')}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {mutation.isPending ? t('AUTH.PW_RESET.SUBMITTING') : t('AUTH.PW_RESET.SUBMIT')}
        </button>
      </form>
    </AuthLayout>
  );
}
