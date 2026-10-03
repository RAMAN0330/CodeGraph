// Which files read or write each database table. Zero imports: the server's
// analysis job runs this while file contents are still in memory (see
// server/src/analysis/sharedRules.ts), and the result ships with the analysis.
//
// Only access patterns count, never a bare word: a comment saying "user"
// is not a use of the users table.
//   sql        FROM / JOIN / INTO / UPDATE / TABLE <name>
//   model      ORM access to the model class (Django, SQLAlchemy, Sequelize,
//              TypeORM, Prisma client)
//   migration  a migration file creating or altering the table

export interface TableRef { name: string; file: string; line?: number; modelName?: string; dbTableName?: string }
export type TableUseKind = 'sql' | 'model' | 'migration';
export interface TableUse { file: string; count: number; kinds: TableUseKind[] }

const MAX_FILES_PER_TABLE = 200;
const MIGRATION_PATH = /(^|\/)(migrations?|alembic\/versions|db\/migrate)\//i;

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

interface Matcher { needles: string[]; sql: RegExp | null; model: RegExp | null; migration: RegExp | null }

function matcherFor(table: TableRef): Matcher {
  const sqlNames = [...new Set([table.dbTableName, table.name, table.name.split('.').pop()]
    .filter((n): n is string => Boolean(n && /^[A-Za-z_][\w]*$/.test(n))))];
  const model = table.modelName && /^[A-Za-z_]\w{2,}$/.test(table.modelName) ? table.modelName : null;
  // Identifier quotes, possibly escaped inside a string literal: "UPDATE \"users\"".
  const quoted = '(?:\\\\?[`"\\[])?';
  const closeQuoted = '(?:\\\\?[`"\\]])?';
  const sql = sqlNames.length
    ? new RegExp(`\\b(?:from|join|into|update|table(?:\\s+if\\s+(?:not\\s+)?exists)?)\\s+${quoted}(?:\\w+${closeQuoted}\\.${quoted})?(?:${sqlNames.map(escape).join('|')})${closeQuoted}(?![\\w.])`, 'gi')
    : null;
  const modelRe = model
    ? new RegExp([
      `\\b${escape(model)}\\.(?:objects|_meta|DoesNotExist|query|findAll|findOne|findByPk|findMany|create|bulkCreate|update|destroy|upsert)\\b`,
      `\\b(?:query|select|get|getRepository|joinedload|selectinload|ForeignKey|OneToOneField|ManyToManyField)\\(\\s*['"]?${escape(model)}\\b`,
      `\\bprisma\\.${escape(lowerFirst(model))}\\.\\w+`,
    ].join('|'), 'g')
    : null;
  const migrationParts: string[] = [];
  if (model) migrationParts.push(`(?:CreateModel|DeleteModel|AlterModelTable|AlterModelOptions)\\(\\s*name\\s*=\\s*['"]${escape(model)}['"]`, `model_name\\s*=\\s*['"]${escape(model.toLowerCase())}['"]`);
  if (sqlNames.length) migrationParts.push(`\\bop\\.\\w+\\(\\s*['"](?:${sqlNames.map(escape).join('|')})['"]`, `\\b(?:create_table|drop_table|add_column|remove_column|rename_table|change_table)\\s*\\(?\\s*:(?:${sqlNames.map(escape).join('|')})\\b`);
  const migration = migrationParts.length ? new RegExp(migrationParts.join('|'), 'gi') : null;
  const needles = [...sqlNames, ...(model ? [model, lowerFirst(model)] : [])].map(n => n.toLowerCase());
  return { needles, sql, model: modelRe, migration };
}

function count(re: RegExp | null, text: string): number {
  if (!re) return 0;
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n++;
  return n;
}

export function linkTablesToCode(tables: TableRef[], files: Array<{ path: string; content: string | null }>): Record<string, TableUse[]> {
  const usage: Record<string, TableUse[]> = {};
  const matchers = tables.map(t => ({ table: t, m: matcherFor(t) }));
  for (const file of files) {
    if (!file.content) continue;
    const lower = file.content.toLowerCase();
    const isMigration = MIGRATION_PATH.test(file.path);
    for (const { table, m } of matchers) {
      // Cheap substring check first; the regexes only run on plausible files.
      if (!m.needles.some(n => lower.includes(n))) continue;
      const kinds: TableUseKind[] = [];
      let total = 0;
      if (isMigration) {
        const n = count(m.migration, file.content) + count(m.sql, file.content);
        if (n) { kinds.push('migration'); total += n; }
      } else {
        // The definition itself (CREATE TABLE in its schema file, the model
        // class's own module) is not a use.
        const definition = file.path === table.file;
        const sqlHits = count(m.sql, file.content) - (definition ? 1 : 0);
        if (sqlHits > 0) { kinds.push('sql'); total += sqlHits; }
        const modelHits = definition ? 0 : count(m.model, file.content);
        if (modelHits) { kinds.push('model'); total += modelHits; }
      }
      if (!total) continue;
      (usage[table.name] ??= []).push({ file: file.path, count: total, kinds });
    }
  }
  for (const name of Object.keys(usage)) {
    usage[name] = usage[name].sort((a, b) => b.count - a.count || a.file.localeCompare(b.file)).slice(0, MAX_FILES_PER_TABLE);
  }
  return usage;
}
