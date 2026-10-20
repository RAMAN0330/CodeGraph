import { Database } from 'lucide-react';
import { useParams } from 'react-router-dom';

export default function MigrationsSection() {
  const { workspaceId } = useParams();
  return (
    <div className="pr-page">
      <div className="pr-card">
        <span className="pr-icon"><Database size={22} strokeWidth={1.7} /></span>
        <h1>Migrations</h1>
        <p>Migrations are drafted from a database project's schema.</p>
        <a className="pr-link-btn" href={workspaceId ? `/workspaces/${workspaceId}/projects` : '/workspaces'}>Open your database projects</a>
      </div>
    </div>
  );
}
