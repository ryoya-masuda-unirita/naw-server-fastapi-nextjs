/**
 * Reports Component - Placeholder
 */
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1>Reports</h1>
      <p>Analytics and reporting dashboard coming soon...</p>

      <div class="placeholder-cards">
        <div class="placeholder-card">
          <div class="placeholder-icon">📊</div>
          <h3>Sales Report</h3>
          <p>View sales analytics</p>
        </div>
        <div class="placeholder-card">
          <div class="placeholder-icon">👥</div>
          <h3>User Report</h3>
          <p>User activity metrics</p>
        </div>
        <div class="placeholder-card">
          <div class="placeholder-icon">📈</div>
          <h3>Growth Report</h3>
          <p>Business growth analytics</p>
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
        p {
          color: #64748b;
          margin: 0 0 2rem;
        }
      }
      .placeholder-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.5rem;
      }
      .placeholder-card {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        h3 {
          margin: 1rem 0 0.5rem;
        }
        p {
          margin: 0;
          color: #64748b;
          font-size: 0.875rem;
        }
      }
      .placeholder-icon {
        font-size: 3rem;
      }
    `,
  ],
})
export class ReportsComponent {}
