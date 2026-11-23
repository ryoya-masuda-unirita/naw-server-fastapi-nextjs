import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormRadio } from '@/components/shared/form-radio';
import { FormSwitch } from '@/components/shared/form-switch';
import { useToastStore } from '@/components/shared/toast-store';
import { useCreateAdminUser } from '@/hooks/use-admin-users';
import type { UserApiRole, UserCreateApiResponse, UserRoleUi } from '@/types/admin/user.types';
import { useFocusFirstInvalidField } from './focus-first-invalid-field';
import { getUserTextErrors, resolveUserTextError } from './user-field-errors';

const DISPLAY_NAME_INPUT_ID = 'admin-users-display-name';
const LOGIN_ID_INPUT_ID = 'admin-users-login-id';
const ADD_DIALOG_WIDTH = '800px';

interface UserAddDialogProps {
  /** 作成できたとき。一覧の条件の初期化と、初期パスワードの表示は呼び出し側でする */
  onCreated: (response: UserCreateApiResponse) => void;
  onClose: () => void;
}

/** 移植元 user-add-dialog.component と、それを開く onAddUser / submitAddUser。開くたびに入力を空から始めるため、開いている間だけ描画する */
export function UserAddDialog({ onCreated, onClose }: UserAddDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const createUser = useCreateAdminUser();
  // 連打で二重に作成しないため、state ではなく ref で見る（state の更新を待たずに弾ける）
  const submittingRef = useRef(false);
  const focusFirstInvalidField = useFocusFirstInvalidField();

  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [issueLoginKey, setIssueLoginKey] = useState(false);
  const [role, setRole] = useState<UserRoleUi>('user');
  const [touched, setTouched] = useState({ displayName: false, userId: false });

  const roleOptions = [
    { label: t('ADMIN.USER_MANAGEMENT.ROLE_GENERAL'), value: 'user' as UserRoleUi },
    { label: t('ADMIN.USER_MANAGEMENT.ROLE_ADMIN'), value: 'admin' as UserRoleUi },
  ];

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setTouched({ displayName: true, userId: true });
    const displayNameInvalid = getUserTextErrors(displayName) !== null;
    const userIdInvalid = getUserTextErrors(userId) !== null;
    if (displayNameInvalid || userIdInvalid) {
      focusFirstInvalidField([
        { id: DISPLAY_NAME_INPUT_ID, invalid: displayNameInvalid },
        { id: LOGIN_ID_INPUT_ID, invalid: userIdInvalid },
      ]);
      return;
    }

    submittingRef.current = true;
    try {
      const response = await createUser.mutateAsync({
        loginId: userId.trim(),
        name: displayName.trim(),
        role: role.toUpperCase() as UserApiRole,
        ...(issueLoginKey ? { issueLoginKey: true } : {}),
      });
      toast.success(t('ADMIN.USER_MANAGEMENT.CREATE_SUCCESS'));
      onCreated(response);
    } catch {
      toast.error(t('ADMIN.USER_MANAGEMENT.CREATE_FAILED'));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog
      open
      title={t('ADMIN.USER_MANAGEMENT.CREATE_NEW_USER')}
      confirmText={t('COMMON.CREATE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      buttonAlign="right"
      confirmMinWidth="min-w-24.5"
      dialogWidth={ADD_DIALOG_WIDTH}
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
          onFormBlur={() => setTouched((prev) => ({ ...prev, displayName: true }))}
          error={resolveUserTextError(displayName, touched.displayName, t)}
          autocomplete="off"
          placeholder={t('ADMIN.USER_MANAGEMENT.PLACEHOLDER_DISPLAY_NAME')}
          dataTestid="admin-users-display-name-input"
        />
        <FormInput
          id={LOGIN_ID_INPUT_ID}
          label={t('ADMIN.USER_MANAGEMENT.USER_ID')}
          supportText={t('ADMIN.USER_MANAGEMENT.SUPPORT_TEXT_USER_ID')}
          value={userId}
          onValueChange={setUserId}
          onFormBlur={() => setTouched((prev) => ({ ...prev, userId: true }))}
          error={resolveUserTextError(userId, touched.userId, t)}
          warning={t('ADMIN.USER_MANAGEMENT.WARNING_TEXT')}
          placeholder={t('ADMIN.USER_MANAGEMENT.PLACEHOLDER_USER_ID')}
          dataTestid="admin-users-login-id-input"
        />
        <FormSwitch
          label={t('ADMIN.USER_MANAGEMENT.ISSUE_LOGIN_KEY')}
          supportText={t('ADMIN.USER_MANAGEMENT.SUPPORT_TEXT_ISSUE_LOGIN_KEY')}
          switchLabel={t('ADMIN.USER_MANAGEMENT.ISSUE_LOGIN_KEY')}
          checked={issueLoginKey}
          onCheckedChange={setIssueLoginKey}
          dataTestid="admin-users-issue-login-key-switch"
        />
        <FormRadio
          label={t('ADMIN.USER_MANAGEMENT.ROLE')}
          supportText={t('ADMIN.USER_MANAGEMENT.SUPPORT_TEXT_ROLE')}
          value={role}
          onValueChange={setRole}
          options={roleOptions}
          layout="vertical"
        />
      </form>
    </Dialog>
  );
}
