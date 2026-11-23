import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormRadio } from '@/components/shared/form-radio';
import { FormSwitch } from '@/components/shared/form-switch';
import { useToastStore } from '@/components/shared/toast-store';
import { useUpdateAdminUser, type UpdateUserPayload } from '@/hooks/use-admin-users';
import type {
  AdminUser,
  LoginKeyAction,
  UserApiRole,
  UserRoleUi,
  UserUpdateApiResponse,
} from '@/types/admin/user.types';
import { useFocusFirstInvalidField } from './focus-first-invalid-field';
import { LoginKeyStatusIcon } from './login-key-status-icon';
import { getUserTextErrors, resolveUserTextError } from './user-field-errors';

const DISPLAY_NAME_INPUT_ID = 'admin-users-display-name';
const EDIT_DIALOG_WIDTH = '800px';

interface UserEditDialogProps {
  user: AdminUser;
  /** 更新できたとき。初期パスワード・ログインキーの表示は呼び出し側でする */
  onUpdated: (response: UserUpdateApiResponse) => void;
  onClose: () => void;
}

/** 選んだ操作が保存するまで反映されないことを伝える説明のキー。「変更しない」のときは出さない */
function getPendingNoteKey(action: LoginKeyAction, hasLoginKey: boolean): string {
  switch (action) {
    case 'REISSUE':
      return hasLoginKey
        ? 'ADMIN.USER_MANAGEMENT.LOGIN_KEY_WILL_REISSUE'
        : 'ADMIN.USER_MANAGEMENT.LOGIN_KEY_WILL_ISSUE';
    case 'REVOKE':
      return 'ADMIN.USER_MANAGEMENT.LOGIN_KEY_WILL_REVOKE';
    default:
      return '';
  }
}

/** 移植元 user-edit-dialog.component と、それを開く onEditUser / submitEditUser */
export function UserEditDialog({ user, onUpdated, onClose }: UserEditDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const updateUser = useUpdateAdminUser();
  const submittingRef = useRef(false);
  const focusFirstInvalidField = useFocusFirstInvalidField();
  // 権限が SYSTEM の行は、権限のラジオに「システム」がないので「一般」として開き、管理者に変えたときだけ権限を送る
  const wasSystemRole = user.role === 'system';
  const hasLoginKey = user.hasLoginKey;

  const [displayName, setDisplayName] = useState(user.displayName);
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [loginKeyAction, setLoginKeyAction] = useState<LoginKeyAction>('KEEP');
  const [role, setRole] = useState<UserRoleUi>(wasSystemRole ? 'user' : user.role);
  const [resetPassword, setResetPassword] = useState(false);

  const roleOptions = [
    { label: t('ADMIN.USER_MANAGEMENT.ROLE_GENERAL'), value: 'user' as UserRoleUi },
    { label: t('ADMIN.USER_MANAGEMENT.ROLE_ADMIN'), value: 'admin' as UserRoleUi },
  ];

  const loginKeyActionOptions = [
    {
      label: t('ADMIN.USER_MANAGEMENT.LOGIN_KEY_KEEP'),
      value: 'KEEP' as LoginKeyAction,
      testid: 'admin-users-login-key-action-keep',
    },
    {
      // キーが未設定のユーザーでは、再発行ではなく初めての発行になる（API には同じ REISSUE を送る）
      label: t(
        hasLoginKey
          ? 'ADMIN.USER_MANAGEMENT.REISSUE_LOGIN_KEY'
          : 'ADMIN.USER_MANAGEMENT.ISSUE_LOGIN_KEY_BUTTON'
      ),
      value: 'REISSUE' as LoginKeyAction,
      testid: 'admin-users-login-key-action-reissue',
    },
    {
      label: t('ADMIN.USER_MANAGEMENT.REVOKE_LOGIN_KEY'),
      value: 'REVOKE' as LoginKeyAction,
      disabled: !hasLoginKey,
      testid: 'admin-users-login-key-action-revoke',
    },
  ];

  const pendingNoteKey = getPendingNoteKey(loginKeyAction, hasLoginKey);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setDisplayNameTouched(true);
    const displayNameInvalid = getUserTextErrors(displayName) !== null;
    if (displayNameInvalid) {
      focusFirstInvalidField([{ id: DISPLAY_NAME_INPUT_ID, invalid: true }]);
      return;
    }

    const payload: UpdateUserPayload = {
      name: displayName.trim(),
      resetPassword: resetPassword || undefined,
      // KEEP は省略と同じなので送らない
      ...(loginKeyAction !== 'KEEP' ? { loginKeyAction } : {}),
    };
    if (!wasSystemRole) {
      payload.role = role.toUpperCase() as UserApiRole;
    } else if (role === 'admin') {
      payload.role = 'ADMIN';
    }

    submittingRef.current = true;
    try {
      // パスのユーザーIDは users.login_id（一覧の行の userId）
      const response = await updateUser.mutateAsync({ loginId: user.userId, payload });
      toast.success(t('ADMIN.USER_MANAGEMENT.UPDATE_SUCCESS'));
      onUpdated(response);
    } catch {
      toast.error(t('ADMIN.USER_MANAGEMENT.UPDATE_FAILED'));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog
      open
      title={t('ADMIN.USER_MANAGEMENT.EDIT_USER_SETTINGS')}
      confirmText={t('COMMON.SAVE')}
      cancelText={t('COMMON.CANCEL')}
      confirmMinWidth="min-w-24.5"
      showCancel
      showConfirm
      buttonAlign="right"
      dialogWidth={EDIT_DIALOG_WIDTH}
      onConfirm={() => void handleSubmit()}
      onClose={onClose}
    >
      <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
        <FormInput
          id={DISPLAY_NAME_INPUT_ID}
          label={t('ADMIN.USER_MANAGEMENT.USER_DISPLAY_NAME')}
          supportText={t('ADMIN.USER_MANAGEMENT.SUPPORT_TEXT_DISPLAY_NAME')}
          value={displayName}
          onValueChange={setDisplayName}
          onFormBlur={() => setDisplayNameTouched(true)}
          error={resolveUserTextError(displayName, displayNameTouched, t)}
          autocomplete="off"
          placeholder={t('ADMIN.USER_MANAGEMENT.PLACEHOLDER_DISPLAY_NAME')}
          dataTestid="admin-users-display-name-input"
        />
        <FormInput
          label={t('ADMIN.USER_MANAGEMENT.USER_ID')}
          supportText={t('ADMIN.USER_MANAGEMENT.SUPPORT_TEXT_USER_ID')}
          value={user.userId}
          disabled
          warning={t('ADMIN.USER_MANAGEMENT.WARNING_TEXT')}
          placeholder={t('ADMIN.USER_MANAGEMENT.PLACEHOLDER_USER_ID')}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-default leading-[1.4]">
              {t('ADMIN.USER_MANAGEMENT.LOGIN_KEY')}
            </p>
            <LoginKeyStatusIcon hasLoginKey={hasLoginKey} testid="admin-users-edit-login-key-status" />
          </div>
          <FormRadio
            value={loginKeyAction}
            onValueChange={setLoginKeyAction}
            options={loginKeyActionOptions}
            layout="horizontal"
          />
          {pendingNoteKey && (
            <p data-testid="admin-users-login-key-pending-note" className="text-xs text-text-medium">
              {t(pendingNoteKey)}
            </p>
          )}
        </div>
        <FormRadio
          label={t('ADMIN.USER_MANAGEMENT.ROLE')}
          supportText={t('ADMIN.USER_MANAGEMENT.SUPPORT_TEXT_ROLE')}
          value={role}
          onValueChange={setRole}
          options={roleOptions}
          layout="vertical"
        />
        <FormSwitch
          label={t('ADMIN.USER_MANAGEMENT.RESET_PASSWORD_LABEL')}
          switchLabel={t('ADMIN.USER_MANAGEMENT.RESET_PASSWORD_LABEL')}
          checked={resetPassword}
          onCheckedChange={setResetPassword}
          dataTestid="admin-users-reset-password-switch"
        />
      </form>
    </Dialog>
  );
}
