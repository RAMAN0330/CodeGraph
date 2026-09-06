import { Database } from 'lucide-react';

export default function MigrationsSection() {
  return (
    <div className="pr-page">
      <div className="pr-card">
        <span className="pr-icon"><Database size={22} strokeWidth={1.7} /></span>
        <h1>Migrations</h1>
        <p>View and manage Django migrations in the Database Visualizer.</p>
        <a className="pr-link-btn" href="/db">Open Database Visualizer</a>
      </div>
    </div>
  );
}
