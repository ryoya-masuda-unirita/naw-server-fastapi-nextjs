/**
 * Admin Settings Component
 */
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiStore } from '@core/stores/ui.store';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <h1>Settings</h1>
      <p>Configure your application preferences</p>

      <div class="settings-grid">
        <div class="settings-card">
          <h2>Appearance</h2>

          <div class="setting-item">
            <div class="setting-info">
              <h3>Compact Sidebar</h3>
              <p>Reduce sidebar width for more content space</p>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                [checked]="uiStore.sidebarCollapsed()"
                (change)="uiStore.toggleSidebar()"
              />
              <span class="toggle__slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-card">
          <h2>Notifications</h2>

          <div class="setting-item">
            <div class="setting-info">
              <h3>Email Notifications</h3>
              <p>Receive updates via email</p>
            </div>
            <label class="toggle">
              <input type="checkbox" checked />
              <span class="toggle__slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <h3>Push Notifications</h3>
              <p>Receive browser push notifications</p>
            </div>
            <label class="toggle">
              <input type="checkbox" />
              <span class="toggle__slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-card">
          <h2>Security</h2>

          <div class="setting-item">
            <div class="setting-info">
              <h3>Two-Factor Authentication</h3>
              <p>Add an extra layer of security</p>
            </div>
            <button class="btn btn-secondary">Enable</button>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <h3>Change Password</h3>
              <p>Update your account password</p>
            </div>
            <button class="btn btn-secondary">Change</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .page {
        h1 {
          margin: 0 0 0.5rem;
        }
        > p {
          color: #64748b;
          margin: 0 0 2rem;
        }
      }

      .settings-grid {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        max-width: 800px;
      }

      .settings-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

        h2 {
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #f1f5f9;
        }
      }

      .setting-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 0;
        border-bottom: 1px solid #f1f5f9;

        &:last-child {
          border-bottom: none;
        }
      }

      .setting-info {
        h3 {
          margin: 0 0 0.25rem;
          font-size: 0.9375rem;
        }
        p {
          margin: 0;
          font-size: 0.875rem;
          color: #64748b;
        }
      }

      .toggle {
        position: relative;
        display: inline-block;
        width: 48px;
        height: 24px;
        cursor: pointer;

        input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        &__slider {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #e2e8f0;
          border-radius: 24px;
          transition: 0.3s;

          &::before {
            content: '';
            position: absolute;
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background: white;
            border-radius: 50%;
            transition: 0.3s;
          }
        }

        input:checked + &__slider {
          background: #6366f1;

          &::before {
            transform: translateX(24px);
          }
        }
      }

      .btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
      }

      .btn-secondary {
        background: #f1f5f9;
        color: #475569;

        &:hover {
          background: #e2e8f0;
        }
      }
    `,
  ],
})
export class AdminSettingsComponent {
  readonly uiStore = inject(UiStore);
}
