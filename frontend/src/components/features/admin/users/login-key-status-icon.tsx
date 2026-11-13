import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';

interface LoginKeyStatusIconProps {
  hasLoginKey: boolean;
  testid: string;
  className?: string;
}

/** ログインキーが設定済みか未設定かを表すアイコン（一覧の列と編集ダイアログで同じ見た目）。キーの値は出さない */
export function LoginKeyStatusIcon({ hasLoginKey, testid, className }: LoginKeyStatusIconProps) {
  const { t } = useTranslation();
  const label = t(
    hasLoginKey ? 'ADMIN.USER_MANAGEMENT.LOGIN_KEY_SET' : 'ADMIN.USER_MANAGEMENT.LOGIN_KEY_UNSET'
  );

  return (
    <span
      data-testid={testid}
      role="img"
      data-state={hasLoginKey ? 'set' : 'unset'}
      aria-label={label}
      className={className}
    >
      <MatIcon
        name={hasLoginKey ? 'check_circle' : 'remove_circle_outline'}
        size={20}
        className={hasLoginKey ? 'text-status-success' : 'text-text-medium'}
      />
    </span>
  );
}
