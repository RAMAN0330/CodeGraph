import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = { value: string; onChange: (value: string) => void; placeholder: string; className?: string };

export function TopbarSearch({ value, onChange, placeholder, className }: Props) {
  const [length, setLength] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (value) return;
    const done = length === placeholder.length;
    const empty = length === 0;
    const delay = done && !deleting ? 1200 : empty && deleting ? 380 : deleting ? 42 : 68;
    const timer = window.setTimeout(() => {
      if (done && !deleting) setDeleting(true);
      else if (empty && deleting) setDeleting(false);
      else setLength(current => current + (deleting ? -1 : 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [deleting, length, placeholder, value]);
  return (
    <label className={cn('relative flex w-full items-center', className)}>
      <Search size={15} className="text-muted-foreground pointer-events-none absolute left-3" />
      <span className="sr-only">{placeholder}</span>
      <Input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={value ? placeholder : placeholder.slice(0, length)}
        style={{ paddingLeft: '2.25rem' }}
        className="h-9 w-full text-[13px] transition-colors focus-visible:border-[#61afef] focus-visible:bg-[#2c313c]"
      />
    </label>
  );
}
