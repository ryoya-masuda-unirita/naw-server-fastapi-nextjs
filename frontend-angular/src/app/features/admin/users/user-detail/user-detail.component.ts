/**
 * User Detail Component
 */
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page__header">
        <a routerLink="/admin/users" class="back-link">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="currentColor"
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
            />
          </svg>
          Back to Users
        </a>
      </div>

      <div class="user-detail">
        <div class="user-header">
          <div class="user-avatar">JD</div>
          <div class="user-info">
            <h1>John Doe</h1>
            <p>john.doe&#64;example.com</p>
            <div class="user-badges">
              <span class="badge badge--admin">Admin</span>
              <span class="status status--active">Active</span>
            </div>
          </div>
          <a [routerLink]="['/admin/users', userId(), 'edit']" class="btn btn-primary">
            Edit User
          </a>
        </div>

        <div class="detail-grid">
          <div class="detail-card">
            <h2>User Information</h2>
            <dl>
              <div class="detail-row">
                <dt>Full Name</dt>
                <dd>John Doe</dd>
              </div>
              <div class="detail-row">
                <dt>Email</dt>
                <dd>john.doe&#64;example.com</dd>
              </div>
              <div class="detail-row">
                <dt>Role</dt>
                <dd>Administrator</dd>
              </div>
              <div class="detail-row">
                <dt>Status</dt>
                <dd><span class="status status--active">Active</span></dd>
              </div>
              <div class="detail-row">
                <dt>Created</dt>
                <dd>January 15, 2026</dd>
              </div>
              <div class="detail-row">
                <dt>Last Login</dt>
                <dd>January 19, 2026 at 10:30 AM</dd>
              </div>
            </dl>
          </div>

          <div class="detail-card">
            <h2>Recent Activity</h2>
            <div class="activity-list">
              <div class="activity-item">
                <span class="activity-dot"></span>
                <div>
                  <p>Logged in</p>
                  <span>2 hours ago</span>
                </div>
              </div>
              <div class="activity-item">
                <span class="activity-dot"></span>
                <div>
                  <p>Updated profile</p>
                  <span>1 day ago</span>
                </div>
              </div>
              <div class="activity-item">
                <span class="activity-dot"></span>
                <div>
                  <p>Created new report</p>
                  <span>3 days ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .page__header {
        margin-bottom: 1.5rem;
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: #64748b;
        text-decoration: none;
        font-size: 0.875rem;
        &:hover {
          color: #475569;
        }
      }

      .user-header {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .user-avatar {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        font-weight: 600;
      }

      .user-info {
        flex: 1;
        h1 {
          margin: 0 0 0.25rem;
          font-size: 1.5rem;
        }
        p {
          margin: 0 0 0.75rem;
          color: #64748b;
        }
      }

      .user-badges {
        display: flex;
        gap: 0.75rem;
      }

      .badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
        &--admin {
          background: #e0e7ff;
          color: #4338ca;
        }
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.75rem;
        &::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        &--active {
          color: #15803d;
          &::before {
            background: #10b981;
          }
        }
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.625rem 1rem;
        border: none;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
      }

      .btn-primary {
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
      }

      .detail-card {
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

      dl {
        margin: 0;
      }

      .detail-row {
        display: flex;
        padding: 0.75rem 0;
        border-bottom: 1px solid #f1f5f9;

        &:last-child {
          border-bottom: none;
        }

        dt {
          width: 120px;
          font-size: 0.875rem;
          color: #64748b;
        }

        dd {
          flex: 1;
          margin: 0;
          font-size: 0.875rem;
        }
      }

      .activity-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .activity-item {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;

        p {
          margin: 0;
          font-size: 0.875rem;
        }
        span {
          font-size: 0.75rem;
          color: #94a3b8;
        }
      }

      .activity-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6366f1;
        margin-top: 0.375rem;
      }
    `,
  ],
})
export class UserDetailComponent {
  private readonly route = inject(ActivatedRoute);

  readonly userId = signal(this.route.snapshot.params['id'] || '1');
}
