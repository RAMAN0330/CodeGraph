import { useMemo, useState } from 'react';
import { Check, Copy, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RULES_FILE, evaluateRules, globToRegExp, type ArchitectureRule, type RuleSeverity, type RuleViolation } from '../services/architectureRules';

interface Props {
  data: any;
  onOpenFile: (path: string) => void;
}

type Relation = 'forbidden' | 'only';
interface Draft { name: string; relation: Relation; a: string; b: string; severity: RuleSeverity }

function FileLink({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  return <button type="button" className="guide-file" onClick={() => onOpenFile(path)} title={`Open ${path} in the code graph`}>{path}</button>;
}

function toRule(d: Draft): ArchitectureRule {
  const split = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);
  return d.relation === 'forbidden'
    ? { kind: 'forbidden', name: d.name.trim() || 'Unnamed rule', severity: d.severity, from: split(d.a), disallow: split(d.b) }
    : { kind: 'only', name: d.name.trim() || 'Unnamed rule', severity: d.severity, to: split(d.a), allowOnlyFrom: split(d.b) };
}

function toJson(rules: ArchitectureRule[]): string {
  return JSON.stringify({
    rules: rules.map(r => r.kind === 'forbidden'
      ? { name: r.name, from: r.from.length === 1 ? r.from[0] : r.from, disallow: r.disallow, ...(r.severity === 'warning' ? { severity: 'warning' } : {}) }
      : { name: r.name, to: r.to.length === 1 ? r.to[0] : r.to, allowOnlyFrom: r.allowOnlyFrom, ...(r.severity === 'warning' ? { severity: 'warning' } : {}) }),
  }, null, 2);
}

function describe(rule: ArchitectureRule) {
  return rule.kind === 'forbidden'
    ? <><code>{rule.from.join(', ')}</code> must not depend on <code>{rule.disallow.join(', ')}</code></>
    : <><code>{rule.to.join(', ')}</code> may only be used by <code>{rule.allowOnlyFrom.join(', ')}</code></>;
}

function ViolationList({ violations, onOpenFile }: { violations: RuleViolation[]; onOpenFile: (path: string) => void }) {
  if (!violations.length) return <p className="rules-ok"><Check size={13} /> No violations</p>;
  return (
    <ul className="ask-list rules-violations">
      {violations.slice(0, 25).map(v => <li key={v.from + v.to}><div><FileLink path={v.from} onOpenFile={onOpenFile} /><span aria-hidden="true">→</span><FileLink path={v.to} onOpenFile={onOpenFile} /></div></li>)}
      {violations.length > 25 && <li className="guide-empty">+{violations.length - 25} more</li>}
    </ul>
  );
}

export default function ArchitectureRules({ data, onOpenFile }: Props) {
  const config = data?.rules ?? { present: false, rules: [], errors: [] };
  const committed: ArchitectureRule[] = config.rules ?? [];
  const violations: RuleViolation[] = data?.ruleViolations ?? [];
  const paths: string[] = useMemo(() => (data?.files ?? []).map((f: any) => f.path), [data]);

  const [drafts, setDrafts] = useState<ArchitectureRule[]>(committed);
  const [form, setForm] = useState<Draft>({ name: '', relation: 'forbidden', a: '', b: '', severity: 'error' });
  const [copied, setCopied] = useState(false);

  const matchCount = (value: string) => {
    const globs = value.split(',').map(s => s.trim()).filter(Boolean);
    if (!globs.length) return null;
    try {
      const res = globs.map(globToRegExp);
      return paths.filter(p => res.some(re => re.test(p))).length;
    } catch {
      return 0;
    }
  };
  const aCount = matchCount(form.a);
  const bCount = matchCount(form.b);
  const formReady = Boolean(form.a.trim() && form.b.trim());
  const preview = useMemo(() => (formReady ? evaluateRules([toRule(form)], data?.connections ?? []) : []), [form, formReady, data]);
  const draftViolations = useMemo(() => evaluateRules(drafts, data?.connections ?? []), [drafts, data]);
  const changed = toJson(drafts) !== toJson(committed);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formReady) return;
    setDrafts(list => [...list, toRule(form)]);
    setForm({ name: '', relation: form.relation, a: '', b: '', severity: form.severity });
  };
  const copy = () => {
    navigator.clipboard.writeText(toJson(drafts) + '\n')
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setCopied(false));
  };

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Architecture rules</h1>
          <p>Rules live in <code>{RULES_FILE}</code> at the repository root, so they're reviewed with the code. Every analysis checks them, and the PR review fails its check when a pull request breaks a rule marked <em>error</em>.</p>
        </div>
      </header>

      {config.errors?.length > 0 && <div className="arch-impact-error rules-errors" role="alert">{config.errors.map((e: string) => <p key={e}>{e}</p>)}</div>}

      <div className="guide-grid">
        <section className="guide-card">
          <h2><ShieldCheck size={15} /> {config.present ? `In the repository (${committed.length})` : `No ${RULES_FILE} yet`}</h2>
          {!config.present && <p className="guide-empty">Add rules with the builder, test them against this analysis, then commit the file to the repository root.</p>}
          {committed.map(rule => {
            const own = violations.filter(v => v.rule === rule.name);
            return (
              <div key={rule.name} className="rules-rule">
                <div className="rules-rule-head"><strong>{rule.name}</strong><span className={`guide-layer ${rule.severity === 'error' ? 'rules-error' : ''}`}>{rule.severity}</span></div>
                <p>{describe(rule)}</p>
                <ViolationList violations={own} onOpenFile={onOpenFile} />
              </div>
            );
          })}
        </section>

        <div className="guide-side">
          <section className="guide-card">
            <h2><Plus size={15} /> Add a rule</h2>
            <form className="rules-form" onSubmit={add}>
              <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="UI never touches the database" /></label>
              <label>Files<input value={form.a} onChange={e => setForm({ ...form, a: e.target.value })} placeholder="src/ui/**" spellCheck={false} />
                {aCount !== null && <small className={aCount ? '' : 'rules-warn'}>{aCount} file{aCount === 1 ? '' : 's'} match</small>}</label>
              <label>Relation
                <select value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value as Relation })}>
                  <option value="forbidden">must not depend on</option>
                  <option value="only">may only be used by</option>
                </select>
              </label>
              <label>Files<input value={form.b} onChange={e => setForm({ ...form, b: e.target.value })} placeholder={form.relation === 'forbidden' ? 'src/db/**' : 'src/services/**'} spellCheck={false} />
                {bCount !== null && <small className={bCount ? '' : 'rules-warn'}>{bCount} file{bCount === 1 ? '' : 's'} match</small>}</label>
              <label>Severity
                <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value as RuleSeverity })}>
                  <option value="error">error — fails the PR check</option>
                  <option value="warning">warning — reported only</option>
                </select>
              </label>
              <p className="rules-hint">Use <code>**</code> for any folders, <code>*</code> within one folder, commas for several patterns.</p>
              {formReady && <p className={preview.length ? 'rules-warn' : 'rules-ok'}>{preview.length ? `${preview.length} existing dependenc${preview.length === 1 ? 'y' : 'ies'} would break this rule` : 'Nothing breaks this rule today'}</p>}
              <Button type="submit" className="guide-copy" disabled={!formReady}><Plus size={14} /> Add to draft</Button>
            </form>
          </section>

          <section className="guide-card">
            <h2>Draft {RULES_FILE}</h2>
            {drafts.length ? (
              <ul className="ask-list">
                {drafts.map((rule, i) => (
                  <li key={i}>
                    <div><strong>{rule.name}</strong><small>{draftViolations.filter(v => v.rule === rule.name).length} violations</small>
                      <button type="button" className="rules-remove" aria-label={`Remove ${rule.name}`} onClick={() => setDrafts(list => list.filter((_, j) => j !== i))}><Trash2 size={13} /></button></div>
                    <p>{describe(rule)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="guide-empty">No rules in the draft.</p>}
            <pre className="rules-json">{toJson(drafts)}</pre>
            <Button className="guide-copy" onClick={copy} disabled={!drafts.length}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy {changed ? 'updated ' : ''}file</>}</Button>
          </section>
        </div>
      </div>
    </div>
  );
}
