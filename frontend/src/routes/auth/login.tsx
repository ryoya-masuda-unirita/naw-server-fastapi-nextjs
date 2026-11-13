import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdLogin } from 'react-icons/md';
import { useAuthStore } from '@/store/auth-store';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { FormInput } from '@/components/shared/form-input';
import { Button } from '@/components/shared/button';
import { PASSWORD_MAX_LENGTH } from '@/lib/constants/validation';
import {
  validatePasswordField,
  validateRequiredField,
  validateUsername,
} from '@/lib/utils/auth-validation';

type LoginField = 'tenantId' | 'username' | 'password';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuthStore();

  const [tenantId, setTenantId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // 移植元 Angular のフォームと同じく、触れた（blur・送信済み）欄だけエラーを出す
  const [touched, setTouched] = useState<Record<LoginField, boolean>>({
    tenantId: false,
    username: false,
    password: false,
  });

  // 空白だけの入力を弾き、前後の空白がヘッダ値に混ざらないようにする
  const trimmedTenantId = tenantId.trim();
  const fieldErrors: Record<LoginField, string> = {
    tenantId: validateRequiredField(trimmedTenantId, t),
    username: validateUsername(username, t),
    password: validatePasswordField(password, t),
  };
  const visibleError = (field: LoginField) => (touched[field] ? fieldErrors[field] : '');
  const touch = (field: LoginField) => setTouched((prev) => ({ ...prev, [field]: true }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ tenantId: true, username: true, password: true });
    if (Object.values(fieldErrors).some(Boolean)) return;

    setError('');
    setIsLoading(true);

    try {
      await login({ tenantId: trimmedTenantId, username, password });
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
      {/* ブラウザ標準の吹き出しではなく、移植元と同じ欄の下の文言で入力チェックを出す */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 md:gap-6">
        <header className="flex items-center py-[10.5px]">
          <h1 className="text-h1 text-text-default">{t('AUTH.LOGIN.TITLE')}</h1>
        </header>

        {error && (
          <div className="rounded bg-bg-error px-3 py-2 text-xs text-status-error">
            {error}
          </div>
        )}

        <FormInput
          id="tenantId"
          label={t('AUTH.LOGIN.TENANT_ID_LABEL')}
          placeholder={t('AUTH.LOGIN.TENANT_ID_PLACEHOLDER')}
          value={tenantId}
          onChange={(v) => { setTenantId(v); setError(''); }}
          onFormBlur={() => touch('tenantId')}
          error={visibleError('tenantId')}
          disabled={isLoading}
          autoComplete="organization"
        />

        <FormInput
          id="username"
          label={t('AUTH.LOGIN.USER_ID_LABEL')}
          placeholder={t('AUTH.LOGIN.USER_ID_PLACEHOLDER')}
          value={username}
          onChange={(v) => { setUsername(v); setError(''); }}
          onFormBlur={() => touch('username')}
          error={visibleError('username')}
          disabled={isLoading}
          autoComplete="username"
        />

        <FormInput
          id="password"
          label={t('AUTH.LOGIN.PASSWORD_LABEL')}
          supportText={t('AUTH.LOGIN.PASSWORD_SUPPORT')}
          placeholder={t('AUTH.LOGIN.PASSWORD_PLACEHOLDER')}
          type="password"
          showPasswordToggle
          value={password}
          onChange={setPassword}
          onFormBlur={() => touch('password')}
          error={visibleError('password')}
          maxLength={PASSWORD_MAX_LENGTH}
          asciiOnly
          disabled={isLoading}
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
