import React from 'react';
import { Database } from 'lucide-react';
import { Icon } from '../../../../shared/components/Icon';
import { dbSchemaToFlowSchema } from '../../../database/services/dbParser';

const ERDiagramGraph = React.lazy(() => import('../../../database/components/ERDiagramGraph'));

interface Props {
  dbSchema: any;
  filteredDbSchema: any;
  dbAppOptions: string[];
  dbSearchQuery: string;
  onSearchChange: (value: string) => void;
  dbAppFilter: string;
  onAppFilterChange: (value: string) => void;
  dbViewMode: 'table' | 'flow';
  onViewModeChange: (mode: 'table' | 'flow') => void;
  selectedDbTable: string | null;
  onSelectTable: (table: string | null) => void;
  onClose: () => void;
}

export default function DbSchemaOverlay({
  dbSchema,
  filteredDbSchema,
  dbAppOptions,
  dbSearchQuery,
  onSearchChange,
  dbAppFilter,
  onAppFilterChange,
  dbViewMode,
  onViewModeChange,
  selectedDbTable,
  onSelectTable,
  onClose,
}: Props) {
  const shownSchema = filteredDbSchema || dbSchema;

  return (
    <div className="db-schema-overlay" onClick={onClose}>
      <div className="db-schema-modal" onClick={e => e.stopPropagation()}>
        <div className="db-schema-header">
          <div className="db-schema-title">
            <Icon name="database" size="l" />
            Database Schema
            {dbSchema && <span className="db-schema-badge">{dbSchema.source.toUpperCase()}</span>}
            {dbSchema && dbSchema.tables.length > 0 && (
              <div className="db-schema-stats" style={{ marginLeft: 12 }}>
                <span className="db-schema-stat-pill"><strong>{dbSchema.tables.length}</strong> tables</span>
                <span className="db-schema-stat-pill"><strong>{dbSchema.tables.reduce((s: number, t: any) => s + t.columns.length, 0)}</strong> columns</span>
                <span className="db-schema-stat-pill"><strong>{dbSchema.relations.length}</strong> relations</span>
              </div>
            )}
          </div>
          <button className="db-schema-close" onClick={onClose}>×</button>
        </div>

        {dbSchema && (
          <div className="db-schema-toolbar">
            <input className="db-schema-search" placeholder="Search tables or columns..." value={dbSearchQuery} onChange={e => { onSearchChange(e.target.value); onSelectTable(null); }} autoFocus />
            {dbAppOptions.length > 0 && (
              <select className="db-schema-search" value={dbAppFilter} onChange={e => { onAppFilterChange(e.target.value); onSelectTable(null); }} style={{ maxWidth: 160 }}>
                <option value="all">All apps</option>
                {dbAppOptions.map(app => <option key={app} value={app}>{app}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
              <button onClick={() => onViewModeChange('table')} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: dbViewMode === 'table' ? 'var(--accent)' : 'transparent', color: dbViewMode === 'table' ? 'white' : 'var(--t2)', cursor: 'pointer' }}>⊞ Table</button>
              <button onClick={() => onViewModeChange('flow')} style={{ padding: '3px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: dbViewMode === 'flow' ? 'var(--accent)' : 'transparent', color: dbViewMode === 'flow' ? 'white' : 'var(--t2)', cursor: 'pointer' }}>◈ Flow</button>
              <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 8 }}>{dbSchema.files.length} schema file{dbSchema.files.length !== 1 ? 's' : ''} analyzed</span>
            </div>
          </div>
        )}

        {!dbSchema ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexDirection: 'column', color: 'var(--t2)' }}>
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 2 }} />
            <div style={{ fontSize: 12 }}>Parsing schema files...</div>
          </div>
        ) : dbSchema.tables.length === 0 ? (
          <div className="db-schema-empty">
            <div className="db-schema-empty-icon icon icon-xxl"><Database size={48} strokeWidth={1.3} /></div>
            <div className="db-schema-empty-title">No Tables Found</div>
            <div className="db-schema-empty-desc">No SQL tables, Django models, Prisma models, or SQLAlchemy entities were detected in the scanned files.</div>
          </div>
        ) : dbViewMode === 'flow' ? (
          <div style={{ flex: 1, minHeight: 0, padding: '1rem' }}>
            <ERDiagramGraph schema={dbSchemaToFlowSchema(shownSchema)} selectedTable={selectedDbTable} />
          </div>
        ) : (
          <div className="db-schema-body">
            <div className="db-schema-sidebar">
              <div className="db-schema-sidebar-title">Tables</div>
              {shownSchema.tables.map((t: any) => (
                <div key={t.name} className={'db-table-nav-item' + (selectedDbTable === t.name ? ' active' : '')} onClick={() => onSelectTable(t.name)}>
                  <span>{t.name}</span>
                  <span className="db-table-nav-count">{t.columns.length}</span>
                </div>
              ))}
            </div>
            <div className="db-schema-canvas">
              <div className="db-tables-grid">
                {shownSchema.tables.slice(0, 120).map((t: any) => {
                  const relCount = shownSchema.relations.filter((r: any) => r.fromTable === t.name || r.toTable === t.name).length;
                  return (
                    <div key={t.name} className={'db-table-card' + (selectedDbTable === t.name ? ' selected' : '')}>
                      <div className="db-table-header" onClick={() => onSelectTable(selectedDbTable === t.name ? null : t.name)}>
                        <span className="db-table-icon">⊞</span>
                        <span className="db-table-name">{t.name}</span>
                        <span className="db-table-file" title={t.file}>{t.file.split('/').pop()}</span>
                      </div>
                      <div className="db-table-cols">
                        {t.columns.map((col: any, ci: number) => (
                          <div key={ci} className="db-col-row">
                            <div className="db-col-key">
                              {col.isPrimaryKey && <span className="db-key-badge db-key-pk" title="Primary Key">PK</span>}
                              {col.isForeignKey && !col.isPrimaryKey && <span className="db-key-badge db-key-fk" title="Foreign Key">FK</span>}
                              {col.isUnique && !col.isPrimaryKey && <span className="db-key-badge db-key-uk" title="Unique">UK</span>}
                              {col.isIndexed && !col.isPrimaryKey && !col.isForeignKey && <span className="db-key-badge db-key-idx" title="Indexed">IDX</span>}
                            </div>
                            <span className="db-col-name">{col.name}</span>
                            <span className="db-col-type">{col.type}</span>
                            {col.isNullable && <span className="db-col-nullable">null</span>}
                            {col.references && <span style={{ fontSize: 8, color: 'var(--blue)', marginLeft: 4 }} title={'→ ' + col.references.table + '.' + col.references.column}>{'→' + col.references.table}</span>}
                          </div>
                        ))}
                      </div>
                      <div className="db-table-footer">
                        <span className="db-table-stat"><strong>{t.columns.length}</strong> columns</span>
                        {relCount > 0 && <span className="db-relation-badge" title="Related tables">{relCount + ' relation' + (relCount !== 1 ? 's' : '')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
