import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth-store';
import { AuthLayout } from '@/components/layouts/auth-layout';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setError('');
    setIsLoading(true);

    try {
      await login({ username, password });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('429')) {
          setError(t('AUTH.LOGIN.PASSWORD_RATELIMIT'));
        } else if (err.message.includes('401') || err.message.includes('403')) {
          setError(t('AUTH.LOGIN.ERROR'));
        } else {
          setError(t('AUTH.LOGIN.UNEXPECTED_ERROR'));
        }
      }
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-6">
        <header className="flex items-center py-[10.5px]">
          <h1 className="text-2xl font-bold">{t('AUTH.LOGIN.TITLE')}</h1>
        </header>

        {error && (
          <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('AUTH.LOGIN.USER_ID_LABEL')}</label>
          <input
            type="text"
            placeholder={t('AUTH.LOGIN.USER_ID_PLACEHOLDER')}
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            disabled={isLoading}
            required
            minLength={3}
            maxLength={50}
            autoComplete="username"
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t('AUTH.LOGIN.PASSWORD_LABEL')}</label>
          <input
            type="password"
            placeholder={t('AUTH.LOGIN.PASSWORD_PLACEHOLDER')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
            maxLength={100}
            autoComplete="current-password"
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLoading ? t('AUTH.LOGIN.SUBMITTING') : t('AUTH.LOGIN.SUBMIT')}
        </button>
      </form>
    </AuthLayout>
  );
}
