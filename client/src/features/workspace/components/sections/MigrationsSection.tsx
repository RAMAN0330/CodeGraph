import { ArrowRight, Database, FileDiff, GitCompare, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Page, PageHeader, Section } from '../../../../shared/components/Page';
import { StateCard } from '../../../../shared/components/StateCard';

const STEPS = [
  { icon: Database, title: 'Open a database project', text: 'Connect a database or load its schema in a database project of this workspace.' },
  { icon: GitCompare, title: 'Open the migration editor', text: 'From the schema view, open the Django migration editor and pick the app and a migration name.' },
  { icon: FileDiff, title: 'Review the generated migration', text: 'A migration file is generated from the schema; edit it in place before you copy it.' },
  { icon: ShieldCheck, title: 'Apply it with your own tooling', text: 'Add it to your repository and run it through your normal migration command and CI.' },
];

export default function MigrationsSection() {
  const { workspaceId } = useParams();
  const href = workspaceId ? `/workspaces/${workspaceId}/projects` : '/workspaces';
  const open = <Button asChild size="sm" className="h-8 gap-1.5 text-xs"><a href={href}>Open your database projects <ArrowRight className="size-3.5" /></a></Button>;
  return (
    <Page>
      <PageHeader
        icon={Database}
        tone="quality"
        title="Migrations"
        description="Migrations are drafted from a database project's schema, not from the code repository."
        actions={open}
      />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Section className="min-h-[260px]" bodyClassName="flex">
          <StateCard icon={Database} title="No migrations in a code workspace" action={<div className="mt-2">{open}</div>}>
            This repository is analysed as code. To draft a migration, open a database project in this workspace and use its migration editor.
          </StateCard>
        </Section>
        <Section title="How migrations work" className="min-h-[260px]">
          <ol className="flex flex-col gap-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><step.icon className="size-4" strokeWidth={1.8} /></span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold"><span className="mr-1.5 font-mono text-muted-foreground">{i + 1}.</span>{step.title}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </Page>
  );
}
