import './reports.css';

const PLACEHOLDER_REPORTS = [
  { icon: '📊', title: 'Sales Report', description: 'View sales analytics' },
  { icon: '👥', title: 'User Report', description: 'User activity metrics' },
  { icon: '📈', title: 'Growth Report', description: 'Business growth analytics' },
];

/** 移植元 `ReportsComponent`（features/admin/reports）。移植元でも中身のないスタブ画面。文言は英語のハードコード */
export function ReportsPage() {
  return (
    <div className="page reports-page">
      <h1>Reports</h1>
      <p>Analytics and reporting dashboard coming soon...</p>

      <div className="placeholder-cards">
        {PLACEHOLDER_REPORTS.map((report) => (
          <div key={report.title} className="placeholder-card">
            <div className="placeholder-icon">{report.icon}</div>
            <h3>{report.title}</h3>
            <p>{report.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
