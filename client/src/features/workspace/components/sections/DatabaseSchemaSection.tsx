import React from 'react';
import { Database } from 'lucide-react';
import { dbSchemaToFlowSchema } from '../../../database/services/dbParser';

const ERDiagramGraph = React.lazy(() => import('../../../database/components/ERDiagramGraph'));

interface Props {
  dbSchema: any;
  filteredDbSchema: any;
  selectedDbTable: string | null;
}

export default function DatabaseSchemaSection({ dbSchema, filteredDbSchema, selectedDbTable }: Props) {
  return (
    <div className="db-page">
      {dbSchema ? (
        <ERDiagramGraph schema={dbSchemaToFlowSchema(filteredDbSchema || dbSchema)} selectedTable={selectedDbTable} />
      ) : (
        <div className="floating-empty">
          <Database size={34} strokeWidth={1.6} />
          <h3>No database schema detected yet</h3>
          <p>Analyze a Django repository to see the ER diagram here.</p>
        </div>
      )}
    </div>
  );
}
