import { useUiStore } from '@/store/ui-store';
import './settings.css';

/**
 * 移植元 `AdminSettingsComponent`（features/admin/settings）。
 * 動くのは「Compact Sidebar」だけで、ほかの設定は移植元でも見た目だけ。文言は英語のハードコード
 */
export function AdminSettingsPage() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <div className="page settings-page">
      <h1>Settings</h1>
      <p>Configure your application preferences</p>

      <div className="settings-grid">
        <div className="settings-card">
          <h2>Appearance</h2>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Compact Sidebar</h3>
              <p>Reduce sidebar width for more content space</p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={sidebarCollapsed} onChange={toggleSidebar} />
              <span className="toggle__slider" />
            </label>
          </div>
        </div>

        <div className="settings-card">
          <h2>Notifications</h2>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Email Notifications</h3>
              <p>Receive updates via email</p>
            </div>
            <label className="toggle">
              <input type="checkbox" defaultChecked />
              <span className="toggle__slider" />
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Push Notifications</h3>
              <p>Receive browser push notifications</p>
            </div>
            <label className="toggle">
              <input type="checkbox" />
              <span className="toggle__slider" />
            </label>
          </div>
        </div>

        <div className="settings-card">
          <h2>Security</h2>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Two-Factor Authentication</h3>
              <p>Add an extra layer of security</p>
            </div>
            <button type="button" className="btn btn-secondary">
              Enable
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <h3>Change Password</h3>
              <p>Update your account password</p>
            </div>
            <button type="button" className="btn btn-secondary">
              Change
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
