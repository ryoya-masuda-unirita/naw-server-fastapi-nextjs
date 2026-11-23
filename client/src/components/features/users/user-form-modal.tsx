import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { LegacyUser } from '@/lib/constants/mock-data';

/** 移植元 environment.minPasswordLength */
const MIN_PASSWORD_LENGTH = 8;

type FormRole = 'admin' | 'user';

/** 保存時に親へ渡す値（移植元 UserFormSavePayload） */
export interface UserFormSavePayload {
  displayName: string;
  userId: string;
  role: FormRole;
  password?: string;
}

const USER_ROLE_OPTIONS: readonly { value: FormRole; labelKey: string }[] = [
  { value: 'admin', labelKey: 'ADMIN_CONSOLE.ADMIN' },
  { value: 'user', labelKey: 'ADMIN_CONSOLE.USER' },
];

/** 3 値ある権限を、フォームの 2 択（admin | user）に寄せる */
function toFormRole(role: string): FormRole {
  return role === 'admin' ? 'admin' : 'user';
}

interface UserFormModalProps {
  /** null なら新規追加、値があれば編集 */
  user: LegacyUser | null;
  onSave: (payload: UserFormSavePayload) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';

/**
 * 移植元 `UserFormModalComponent`（features/users/components/user-form-modal）。
 * 親は開いている間だけ描画する前提（開くたびに入力値を作り直す）。
 */
export function UserFormModal({ user, onSave, onCancel, onDelete }: UserFormModalProps) {
  const { t } = useTranslation();
  const isEditMode = user !== null;
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [userId, setUserId] = useState(user?.username ?? '');
  const [role, setRole] = useState<FormRole | ''>(user ? toFormRole(user.role) : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !userId.trim() || !role) return;
    if (!isEditMode && (!password || password.length < MIN_PASSWORD_LENGTH)) return;
    if (isEditMode && password && password.length < MIN_PASSWORD_LENGTH) return;

    const payload: UserFormSavePayload = {
      displayName: displayName.trim(),
      userId: userId.trim(),
      role,
    };
    if (password) payload.password = password;
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditMode ? t('ADMIN_CONSOLE.EDIT_USER_TITLE') : t('ADMIN_CONSOLE.ADD_USER_TITLE')}
          </h2>
        </div>

        {/* 移植元は Angular が novalidate を付けるため、ブラウザ標準の入力チェックは出ない */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-6">
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              {t('ADMIN_CONSOLE.DISPLAY_NAME')}
            </p>
            <input
              type="text"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              placeholder={t('ADMIN_CONSOLE.PLACEHOLDER')}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              {t('ADMIN_CONSOLE.USER_ID')}
            </p>
            <input
              type="text"
              name="userId"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
              disabled={isEditMode}
              placeholder={t('ADMIN_CONSOLE.PLACEHOLDER')}
              className={`${INPUT_CLASS} disabled:bg-gray-100 disabled:text-gray-600`}
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              {t('ADMIN_CONSOLE.PERMISSION')}
            </p>
            <select
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value as FormRole | '')}
              required
              className={INPUT_CLASS}
            >
              <option value="" disabled>
                {t('ADMIN_CONSOLE.ALL_ROLES')}
              </option>
              {USER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              {t('ADMIN_CONSOLE.PASSWORD')}
            </p>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required={!isEditMode}
                minLength={MIN_PASSWORD_LENGTH}
                placeholder={t('ADMIN_CONSOLE.PLACEHOLDER')}
                className={`${INPUT_CLASS} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            {isEditMode ? (
              <button
                type="button"
                onClick={() => onDelete(user.id)}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                {t('COMMON.DELETE')}
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
              >
                {t('ADMIN_CONSOLE.CANCEL')}
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
              >
                {t('ADMIN_CONSOLE.SAVE')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
