import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { organizationStore, type Project } from '../services/organizationStore';

// Where scheduled re-analysis posts regressions for this project's repository.
export function AlertWebhookSection({ project, onChange }: { project: Project; onChange: () => void }) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    action()
      .then(() => { setMessage({ text: success, error: false }); onChange(); })
      .catch(cause => setMessage({ text: cause instanceof Error ? cause.message : 'Something went wrong.', error: true }))
      .finally(() => setBusy(false));
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => organizationStore.setAlertWebhook(project.id, url.trim()).then(() => setUrl('')), 'Saved. Regressions will be posted to this channel.');
  };

  return (
    <div className="project-members-section">
      <div className="project-section-title">
        <h2>Regression alerts</h2>
        <p>Structrace re-analyzes this repository when its default branch changes. When health drops or new cycles, security findings or architecture violations appear, it posts to a Slack or Discord channel.</p>
      </div>
      {project.alertWebhookConfigured && (
        <p className="organization-success" role="status">
          <BellRing size={14} aria-hidden="true" /> Alerts are on.{' '}
          <Button className="project-row-open-button" disabled={busy} onClick={() => run(() => organizationStore.testAlertWebhook(project.id), 'Test message sent.')}>Send test</Button>{' '}
          <Button className="project-delete-button" disabled={busy} onClick={() => run(() => organizationStore.setAlertWebhook(project.id, null), 'Alerts turned off.')}>Turn off</Button>
        </p>
      )}
      <form className="project-invite-form" onSubmit={save}>
        <BellRing size={16} />
        <Label htmlFor="project-alert-webhook" className="sr-only">Slack or Discord webhook URL</Label>
        <Input id="project-alert-webhook" type="url" placeholder="https://hooks.slack.com/services/…" value={url} onChange={event => { setUrl(event.target.value); setMessage(null); }} autoComplete="off" spellCheck={false} />
        <Button className="projects-primary-action" type="submit" disabled={busy || !url.trim()}>{project.alertWebhookConfigured ? 'Replace' : 'Save'}</Button>
      </form>
      {message && <p className={message.error ? 'organization-error' : 'organization-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </div>
  );
}
