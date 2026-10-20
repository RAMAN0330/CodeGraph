export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export const toneText: Record<Tone, string> = {
  good: 'text-[var(--color-success)]',
  warn: 'text-[var(--color-warning)]',
  bad: 'text-[var(--color-danger)]',
  neutral: 'text-muted-foreground',
};

export const toneFill: Record<Tone, string> = {
  good: 'bg-[var(--color-success)]',
  warn: 'bg-[var(--color-warning)]',
  bad: 'bg-[var(--color-danger)]',
  neutral: 'bg-muted-foreground',
};
