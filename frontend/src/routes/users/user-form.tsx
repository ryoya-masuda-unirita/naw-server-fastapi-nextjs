import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ROUTES } from '@/lib/constants/routes';

/** 移植元の「API 呼び出しの模擬」の待ち時間 */
const SIMULATED_SAVE_DELAY_MS = 1500;

const FIELD_CLASS =
  'px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all';
const LABEL_CLASS = 'text-sm font-medium text-gray-700';

/**
 * 移植元 `UserFormComponent`（features/admin/users/user-form）。`/users/new` と `/users/:id/edit` で共用する。
 * 移植元は保存せず、1.5 秒待ってユーザー一覧へ戻るだけのモック。文言も移植元どおり英語のハードコード
 */
export function UserFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  // 編集時は移植元と同じ固定のモック値を入れる
  const [firstName, setFirstName] = useState(isEditMode ? 'John' : '');
  const [lastName, setLastName] = useState(isEditMode ? 'Doe' : '');
  const [email, setEmail] = useState(isEditMode ? 'john@example.com' : '');
  const [role, setRole] = useState(isEditMode ? 'admin' : 'user');
  const [status, setStatus] = useState('active');
  const [password, setPassword] = useState('');
  const [bio, setBio] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    timerRef.current = setTimeout(() => {
      setIsLoading(false);
      navigate(ROUTES.APP.ADMIN_USERS);
    }, SIMULATED_SAVE_DELAY_MS);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          to={ROUTES.APP.ADMIN_USERS}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-700 text-sm no-underline"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="currentColor"
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
            />
          </svg>
          Back to Users
        </Link>
      </div>

      <div className="max-w-2xl bg-white rounded-xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-6">{isEditMode ? 'Edit User' : 'Add New User'}</h1>

        {/* 移植元は Angular が novalidate を付けるため、必須でも空のまま送信できる */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="firstName" className={LABEL_CLASS}>
                First Name *
              </label>
              <input
                id="firstName"
                type="text"
                name="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="Enter first name"
                required
                className={FIELD_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lastName" className={LABEL_CLASS}>
                Last Name *
              </label>
              <input
                id="lastName"
                type="text"
                name="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Enter last name"
                required
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className={LABEL_CLASS}>
              Email Address *
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              required
              className={FIELD_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="role" className={LABEL_CLASS}>
                Role *
              </label>
              <select
                id="role"
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                required
                className={FIELD_CLASS}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="status" className={LABEL_CLASS}>
                Status *
              </label>
              <select
                id="status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                required
                className={FIELD_CLASS}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {!isEditMode && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className={LABEL_CLASS}>
                Password *
              </label>
              <input
                id="password"
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                required
                className={FIELD_CLASS}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="bio" className={LABEL_CLASS}>
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Tell us about this user..."
              rows={4}
              className={`${FIELD_CLASS} resize-y min-h-[100px]`}
            />
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t border-slate-100 mt-2">
            <Link
              to={ROUTES.APP.ADMIN_USERS}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium no-underline hover:bg-slate-200 transition-all"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/40 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : isEditMode ? (
                'Update User'
              ) : (
                'Create User'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
