import { Link, useParams } from 'react-router-dom';
import { ROUTES } from '@/lib/constants/routes';
import './user-detail.css';

/** URL に id がないときの表示用（移植元と同じ） */
const DEFAULT_USER_ID = '1';

const RECENT_ACTIVITIES = [
  { label: 'Logged in', when: '2 hours ago' },
  { label: 'Updated profile', when: '1 day ago' },
  { label: 'Created new report', when: '3 days ago' },
];

/**
 * 移植元 `UserDetailComponent`（features/admin/users/user-detail）。
 * 移植元は URL の id に関わらず固定のモック（John Doe）を表示する。文言も英語のハードコード。
 * 「Edit User」のリンク先 `/admin/users/:id/edit` は移植元にもルートがない（移植元どおり）
 */
export function UserDetailPage() {
  const params = useParams();
  const userId = params.id || DEFAULT_USER_ID;

  return (
    <div className="page user-detail-page">
      <div className="page__header">
        <Link to={ROUTES.APP.ADMIN_USERS} className="back-link">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="currentColor"
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
            />
          </svg>
          Back to Users
        </Link>
      </div>

      <div className="user-detail">
        <div className="user-header">
          <div className="user-avatar">JD</div>
          <div className="user-info">
            <h1>John Doe</h1>
            <p>john.doe@example.com</p>
            <div className="user-badges">
              <span className="badge badge--admin">Admin</span>
              <span className="status status--active">Active</span>
            </div>
          </div>
          <Link to={`${ROUTES.APP.ADMIN_USERS}/${userId}/edit`} className="btn btn-primary">
            Edit User
          </Link>
        </div>

        <div className="detail-grid">
          <div className="detail-card">
            <h2>User Information</h2>
            <dl>
              <div className="detail-row">
                <dt>Full Name</dt>
                <dd>John Doe</dd>
              </div>
              <div className="detail-row">
                <dt>Email</dt>
                <dd>john.doe@example.com</dd>
              </div>
              <div className="detail-row">
                <dt>Role</dt>
                <dd>Administrator</dd>
              </div>
              <div className="detail-row">
                <dt>Status</dt>
                <dd>
                  <span className="status status--active">Active</span>
                </dd>
              </div>
              <div className="detail-row">
                <dt>Created</dt>
                <dd>January 15, 2026</dd>
              </div>
              <div className="detail-row">
                <dt>Last Login</dt>
                <dd>January 19, 2026 at 10:30 AM</dd>
              </div>
            </dl>
          </div>

          <div className="detail-card">
            <h2>Recent Activity</h2>
            <div className="activity-list">
              {RECENT_ACTIVITIES.map((activity) => (
                <div key={activity.label} className="activity-item">
                  <span className="activity-dot" />
                  <div>
                    <p>{activity.label}</p>
                    <span>{activity.when}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
