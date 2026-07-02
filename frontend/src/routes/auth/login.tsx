import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdLogin } from 'react-icons/md';
import { useAuthStore } from '@/store/auth-store';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { FormInput } from '@/components/shared/form-input';
import { Button } from '@/components/shared/button';

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
          <h1 className="text-h1 text-text-default">{t('AUTH.LOGIN.TITLE')}</h1>
        </header>

        {error && (
          <div className="rounded bg-bg-error px-3 py-2 text-xs text-status-error">
            {error}
          </div>
        )}

        <FormInput
          id="username"
          label={t('AUTH.LOGIN.USER_ID_LABEL')}
          placeholder={t('AUTH.LOGIN.USER_ID_PLACEHOLDER')}
          value={username}
          onChange={(v) => { setUsername(v); setError(''); }}
          disabled={isLoading}
          required
          autoComplete="username"
        />

        <FormInput
          id="password"
          label={t('AUTH.LOGIN.PASSWORD_LABEL')}
          supportText={t('AUTH.LOGIN.PASSWORD_SUPPORT')}
          placeholder={t('AUTH.LOGIN.PASSWORD_PLACEHOLDER')}
          type="password"
          value={password}
          onChange={setPassword}
          disabled={isLoading}
          required
          autoComplete="current-password"
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={isLoading}
          loading={isLoading}
        >
          <MdLogin className="size-5 shrink-0" />
          {t('AUTH.LOGIN.SUBMIT')}
        </Button>
      </form>
    </AuthLayout>
  );
}
