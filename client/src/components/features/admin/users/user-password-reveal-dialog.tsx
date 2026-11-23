import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';

/** コピーしました表示を戻すまでの時間（移植元 setTimeout 3000） */
const COPIED_RESET_MS = 3000;

interface UserPasswordRevealDialogProps {
  /** 初期パスワードが発行されたときだけ入る（キーだけを再発行したときは null） */
  initialPassword: string | null;
  passwordExpiredAt: string | null;
  /** ログインキーが発行されたときだけ入る。この画面でしか表示しない */
  loginKey: string | null;
}

function formatExpiredAt(expiredAt: string | null): string {
  if (!expiredAt) return '';
  return new Date(expiredAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** コピーしたあと一定時間だけ true になる state */
function useCopiedFlag() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };
  return { copied, copy };
}

/** 移植元 user-password-reveal-dialog.component。発行した初期パスワード・ログインキーを 1 回だけ表示するダイアログの中身 */
export function UserPasswordRevealDialog({
  initialPassword,
  passwordExpiredAt,
  loginKey,
}: UserPasswordRevealDialogProps) {
  const { t } = useTranslation();
  const password = useCopiedFlag();
  const key = useCopiedFlag();

  return (
    <div className="flex flex-col gap-6">
      {loginKey && (
        <>
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <span className="text-amber-600 text-lg leading-none mt-0.5">⚠</span>
            <p className="text-sm text-amber-800">{t('ADMIN.USER_MANAGEMENT.LOGIN_KEY_REVEAL_WARNING')}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text-muted">{t('ADMIN.USER_MANAGEMENT.LOGIN_KEY')}</p>
            <div className="flex items-center gap-3">
              <code
                data-testid="admin-users-login-key-value"
                className="flex-1 rounded-md bg-surface-subtle px-4 py-3 font-mono text-sm break-all text-text-strong"
              >
                {loginKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                dataTestid="admin-users-login-key-copy-button"
                onClick={() => void key.copy(loginKey)}
              >
                {t(
                  key.copied
                    ? 'ADMIN.USER_MANAGEMENT.LOGIN_KEY_COPIED'
                    : 'ADMIN.USER_MANAGEMENT.COPY_LOGIN_KEY'
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {initialPassword && (
        <>
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <span className="text-amber-600 text-lg leading-none mt-0.5">⚠</span>
            <p className="text-sm text-amber-800">{t('ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_WARNING')}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text-muted">
              {t('ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_LABEL')}
            </p>
            <div className="flex items-center gap-3">
              <code
                data-testid="admin-users-initial-password-value"
                className="flex-1 rounded-md bg-surface-subtle px-4 py-3 font-mono text-sm break-all text-text-strong"
              >
                {initialPassword}
              </code>
              <Button
                variant="outline"
                size="sm"
                dataTestid="admin-users-initial-password-copy-button"
                onClick={() => void password.copy(initialPassword)}
              >
                {t(
                  password.copied
                    ? 'ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_COPIED'
                    : 'ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_COPY'
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-muted">
              {t('ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_EXPIRY_LABEL')}
            </p>
            <p className="text-sm text-text-strong">{formatExpiredAt(passwordExpiredAt)}</p>
          </div>
        </>
      )}
    </div>
  );
}
