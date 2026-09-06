import { useMemo, useState } from 'react';
import type { MutableRefObject } from 'react';
import { GitHub } from '../../repository/services/github';
import { parseDbSchema } from '../../database/services/dbParser';

function isSchemaFile(path: string, name: string): boolean {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const lname = name.toLowerCase();
  const lpath = path.toLowerCase();
  if (ext === 'sql' || ext === 'prisma') return true;
  if (ext === 'py') {
    // Django: models.py, models/xxx.py, admin.py (sometimes has models), apps with models dir
    if (lname === 'models.py') return true;
    if (lpath.includes('/models/') && lname.endsWith('.py') && !lname.startsWith('test')) return true;
    if (lname === 'serializers.py' || lname === 'schema.py') return true;
  }
  if ((ext === 'ts' || ext === 'js') && (lname.includes('schema') || lname.includes('model') || lname.includes('entity') || lname.includes('migration'))) return true;
  return false;
}

interface Params {
  data: any;
  repoInfo: any;
  localDirHandle: any;
  currentBranch: string;
  analysisContentCacheRef: MutableRefObject<Record<string, string>>;
  showNotification: (msg: string, type?: string) => void;
}

export function useDbSchemaLoader({ data, repoInfo, localDirHandle, currentBranch, analysisContentCacheRef, showNotification }: Params) {
  const [showDbSchema, setShowDbSchema] = useState(false);
  const [dbViewMode, setDbViewMode] = useState<'table' | 'flow'>('table');
  const [dbSchema, setDbSchema] = useState<any>(null);
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [dbAppFilter, setDbAppFilter] = useState('all');
  const [selectedDbTable, setSelectedDbTable] = useState<string | null>(null);

  const dbAppOptions = useMemo(() => {
    if (!dbSchema) return [];
    return [...new Set(dbSchema.tables.map((t: any) => t.app).filter(Boolean))].sort();
  }, [dbSchema]);

  const filteredDbSchema = useMemo(() => {
    if (!dbSchema) return null;
    const q = (dbSearchQuery || '').toLowerCase();
    const tables = dbSchema.tables.filter((t: any) => {
      if (dbAppFilter !== 'all' && t.app !== dbAppFilter) return false;
      if (selectedDbTable && t.name !== selectedDbTable) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.columns.some((c: any) => (c.name || '').toLowerCase().includes(q) || (c.type || '').toLowerCase().includes(q));
    });
    const tableNames = new Set(tables.map((t: any) => t.name));
    return Object.assign({}, dbSchema, {
      tables,
      relations: dbSchema.relations.filter((r: any) => tableNames.has(r.fromTable) && tableNames.has(r.toTable)),
    });
  }, [dbSchema, dbSearchQuery, dbAppFilter, selectedDbTable]);

  function openDbSchema() {
    if (!data) return;
    setShowDbSchema(true);
    setDbSchema(null);
    setDbSearchQuery('');
    setDbAppFilter('all');
    setSelectedDbTable(null);

    const dataFiles: any[] = data.files || [];
    // Build a path→content map from already-analyzed files
    const contentMap: Record<string, string> = Object.assign({}, analysisContentCacheRef.current || {});
    dataFiles.forEach((f: any) => { if (f.content) contentMap[f.path] = f.content; });

    // Collect schema candidates from already-known files
    const knownCandidates = dataFiles.filter((f: any) => isSchemaFile(f.path, f.name));
    const knownPaths = new Set(knownCandidates.map((f: any) => f.path));

    function fetchAndParse(candidates: any[]) {
      const toLoad = candidates.slice(0, 400);
      const loaded: any[] = [];
      let i = 0;
      function next() {
        if (i >= toLoad.length) {
          const schema = parseDbSchema(loaded);
          setDbSchema(schema);
          if (schema.tables.length === 0) showNotification('No DB tables found — try a repo with Django models, SQL files, or Prisma schema', 'warning');
          else showNotification('Found ' + schema.tables.length + ' tables from ' + schema.source.toUpperCase() + ' (' + schema.files.length + ' files)', 'success');
          return;
        }
        const f = toLoad[i++];
        if (contentMap[f.path]) {
          loaded.push({ path: f.path, content: contentMap[f.path] }); next();
        } else if (repoInfo && !localDirHandle) {
          GitHub.getFile(repoInfo.owner, repoInfo.repo, f.path, currentBranch || undefined).then((c: any) => {
            contentMap[f.path] = c || '';
            analysisContentCacheRef.current[f.path] = c || '';
            loaded.push({ path: f.path, content: c || '' }); next();
          }).catch(() => next());
        } else if (localDirHandle) {
          (async () => {
            try {
              const parts = f.path.split('/');
              let h: any = localDirHandle;
              for (let j = 0; j < parts.length - 1; j++) h = await h.getDirectoryHandle(parts[j]);
              const fh = await h.getFileHandle(parts[parts.length - 1]);
              const fo = await fh.getFile();
              const c = await fo.text();
              contentMap[f.path] = c;
              analysisContentCacheRef.current[f.path] = c || '';
              loaded.push({ path: f.path, content: c });
            } catch { /* skip */ }
            next();
          })();
        } else { next(); }
      }
      next();
    }

    // For GitHub repos: also scan full tree for models.py files not in analyzed set
    if (repoInfo && !localDirHandle) {
      GitHub.scanTree(repoInfo.owner, repoInfo.repo, null, null, currentBranch || undefined).then((result: any) => {
        const treeFiles: any[] = result.files || [];
        const extra = treeFiles.filter((f: any) => isSchemaFile(f.path, f.name) && !knownPaths.has(f.path));
        // Prioritize: models.py first, then other schema files
        const all = [...knownCandidates, ...extra].sort((a: any, b: any) => {
          const aScore = (a.name === 'models.py' ? 0 : a.path.includes('/models/') ? 1 : 2);
          const bScore = (b.name === 'models.py' ? 0 : b.path.includes('/models/') ? 1 : 2);
          return aScore - bScore;
        });
        fetchAndParse(all);
      }).catch(() => {
        // Tree API failed — fall back to already-known candidates
        fetchAndParse(knownCandidates);
      });
    } else {
      fetchAndParse(knownCandidates);
    }
  }

  return {
    showDbSchema, setShowDbSchema,
    dbViewMode, setDbViewMode,
    dbSchema, setDbSchema,
    dbSearchQuery, setDbSearchQuery,
    dbAppFilter, setDbAppFilter,
    selectedDbTable, setSelectedDbTable,
    dbAppOptions, filteredDbSchema,
    openDbSchema,
  };
}
