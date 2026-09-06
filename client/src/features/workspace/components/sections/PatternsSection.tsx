import { useMemo, useState } from 'react';
import {
  AlertTriangle, Box, Building2, ChevronRight, Database, Eye, Factory,
  Globe, Layers, Link2, Lock, Puzzle, Radio, RefreshCw, Route, ScrollText,
  Search, Shapes, ShieldCheck, Sparkles, Workflow,
} from 'lucide-react';
import { patternReferenceFor } from '../../../analysis/data/patternReference';

interface PatternFile {
  name: string;
  path: string;
  fns?: number;
  lines?: number;
}

interface Pattern {
  icon: string;
  name: string;
  desc: string;
  severity?: 'info' | 'warning';
  isAnti?: boolean;
  files: PatternFile[];
  metrics?: Record<string, number>;
}

interface Props {
  data: { patterns?: Pattern[] } | null;
  onSelectFile?: (path: string) => void;
  onViewSource?: (path: string, line?: number) => void;
}

type Category = 'all' | 'design' | 'anti';

const ICONS: Record<string, any> = {
  lock: Lock, factory: Factory, eye: Eye, hook: Workflow, spark: Sparkles,
  globe: Globe, layout: Building2, box: Box, building: Building2, route: Route,
  database: Database, layers: Layers, refresh: RefreshCw, puzzle: Puzzle,
  radio: Radio, link: Link2, warning: AlertTriangle, scroll: ScrollText,
};

function iconFor(pattern: Pattern) {
  return ICONS[pattern.icon] ?? Shapes;
}

function isAntiPattern(pattern: Pattern) {
  return !!pattern.isAnti || pattern.severity === 'warning';
}

export default function PatternsSection({ data, onSelectFile, onViewSource }: Props) {
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const patterns = data?.patterns ?? [];

  const counts = useMemo(() => {
    const design = patterns.filter(p => !isAntiPattern(p)).length;
    const anti = patterns.filter(isAntiPattern).length;
    return { all: patterns.length, design, anti };
  }, [patterns]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patterns.filter(p => {
      if (category === 'design' && isAntiPattern(p)) return false;
      if (category === 'anti' && !isAntiPattern(p)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    });
  }, [patterns, category, query]);

  const selected = useMemo(
    () => visible.find(p => p.name === selectedName) ?? null,
    [visible, selectedName],
  );

  if (!data) {
    return (
      <div className="pat-page">
        <PatternsHeader query={query} onQuery={setQuery} disabled />
        <div className="pat-empty">
          <Shapes size={34} strokeWidth={1.6} />
          <h3>No analysis yet</h3>
          <p>Analyze a repository to detect design patterns and anti-patterns in its code structure.</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Category; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'design', label: 'Design Patterns', count: counts.design },
    { id: 'anti', label: 'Anti-patterns', count: counts.anti },
  ];

  const tabsNode = (
    <div className="pat-tabs" role="tablist" aria-label="Filter patterns">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={category === tab.id}
          className={`pat-tab pat-tab-${tab.id}${category === tab.id ? ' active' : ''}`}
          onClick={() => setCategory(tab.id)}
        >
          {tab.label}
          <span>{tab.count}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="pat-page">
      <PatternsHeader query={query} onQuery={setQuery} tabs={tabsNode} />

      <div className={`pat-body${selected ? ' with-detail' : ''}`}>
        <section className="pat-list-panel">
          <header className="pat-list-header">
            <strong>{visible.length} pattern{visible.length === 1 ? '' : 's'}</strong>
          </header>

          {visible.length === 0 ? (
            <div className="pat-empty pat-empty-inline">
              <ShieldCheck size={30} strokeWidth={1.6} />
              <h3>{patterns.length === 0 ? 'No patterns detected' : 'No matching patterns'}</h3>
              <p>
                {patterns.length === 0
                  ? 'Patterns are detected based on code structure and naming conventions.'
                  : 'Try a different category or search term.'}
              </p>
            </div>
          ) : (
            <div className="pat-list">
              {visible.map(pattern => {
                const Glyph = iconFor(pattern);
                const anti = isAntiPattern(pattern);
                return (
                  <button
                    key={pattern.name}
                    className={`pat-row${anti ? ' anti' : ''}${selectedName === pattern.name ? ' selected' : ''}`}
                    onClick={() => setSelectedName(pattern.name)}
                    aria-current={selectedName === pattern.name}
                  >
                    <span className="pat-row-icon"><Glyph size={18} strokeWidth={1.8} /></span>
                    <span className="pat-row-body">
                      <span className="pat-row-title">{pattern.name}</span>
                      <span className="pat-row-desc">{pattern.desc}</span>
                      <span className="pat-row-meta">{pattern.files.length} file{pattern.files.length !== 1 ? 's' : ''}</span>
                    </span>
                    {anti && <span className="pat-badge">Anti-pattern</span>}
                    <ChevronRight className="pat-row-chevron" size={16} strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selected && (
          <PatternDetail
            pattern={selected}
            onClose={() => setSelectedName(null)}
            onSelectFile={onSelectFile}
            onViewSource={onViewSource}
          />
        )}
      </div>
    </div>
  );
}

function PatternsHeader({
  query, onQuery, disabled, tabs,
}: {
  query: string;
  onQuery: (v: string) => void;
  disabled?: boolean;
  tabs?: React.ReactNode;
}) {
  return (
    <header className="pat-header">
      <div className="pat-header-copy">
        <h1>Patterns</h1>
        <p>Design patterns and anti-patterns detected across your codebase.</p>
      </div>
      <div className="pat-header-actions">
        {tabs}
        <div className="pat-search">
          <Search size={15} strokeWidth={1.8} />
          <input
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Search patterns…"
            disabled={disabled}
          />
        </div>
      </div>
    </header>
  );
}

function PatternDetail({
  pattern, onClose, onSelectFile, onViewSource,
}: {
  pattern: Pattern;
  onClose: () => void;
  onSelectFile?: (path: string) => void;
  onViewSource?: (path: string, line?: number) => void;
}) {
  const Glyph = iconFor(pattern);
  const anti = isAntiPattern(pattern);
  const reference = patternReferenceFor(pattern.name);
  const metrics = Object.entries(pattern.metrics ?? {});

  return (
    <aside className="pat-detail" aria-label={`${pattern.name} details`}>
      <header className="pat-detail-head">
        <span className={`pat-detail-icon${anti ? ' anti' : ''}`}><Glyph size={22} strokeWidth={1.7} /></span>
        <div className="pat-detail-title">
          <h2>{pattern.name}</h2>
          <p>{pattern.desc}</p>
        </div>
        {anti && <span className="pat-badge">Anti-pattern</span>}
        <button className="pat-detail-close" onClick={onClose} aria-label="Close details">×</button>
      </header>

      {metrics.length > 0 && (
        <div className="pat-metrics">
          {metrics.map(([key, value]) => (
            <div key={key} className="pat-metric">
              <strong>{value}</strong>
              <span>{key}</span>
            </div>
          ))}
        </div>
      )}

      <section className="pat-block">
        <h3>{anti ? 'Why This Is a Risk' : 'What This Means'}</h3>
        <p className="pat-prose">{reference.why}</p>
      </section>

      {reference.recommendation && (
        <section className="pat-block">
          <h3>Recommendation</h3>
          <p className="pat-prose">{reference.recommendation}</p>
        </section>
      )}

      <section className="pat-block">
        <h3>Files ({pattern.files.length})</h3>
        <div className="pat-files">
          {pattern.files.map((file, i) => (
            <div key={`${file.path}-${i}`} className="pat-file">
              <button className="pat-file-main" onClick={() => onSelectFile?.(file.path)}>
                <strong>{file.name}</strong>
                <code>{file.path}</code>
              </button>
              <span className="pat-file-meta">
                {file.fns != null && <em>{file.fns} fns</em>}
                {file.lines != null && <em>{file.lines} lines</em>}
              </span>
              {onViewSource && (
                <button className="pat-file-view" onClick={() => onViewSource(file.path)} title="View source">
                  <Eye size={13} strokeWidth={1.9} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
