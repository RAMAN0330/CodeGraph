import { useCallback, useEffect, useState } from 'react';
import { appConfig } from '../../../app/config';

// Team notes on repository files (server: /api/annotations). Shared inside
// the organization; see server/src/db/annotations.ts for who may do what.

export interface Annotation {
  id: number;
  path: string;
  body: string;
  author: string | null;
  authorId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${appConfig.apiUrl}${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Request failed.');
  return body as T;
}

// Link that reopens the workspace with this file selected.
export function fileLink(owner: string, repo: string, path: string): string {
  const url = new URL('/workspace', window.location.origin);
  url.searchParams.set('repo', `${owner}/${repo}`);
  url.searchParams.set('file', path);
  return url.toString();
}

export function useRepoAnnotations(owner: string | undefined, repo: string | undefined) {
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [me, setMe] = useState<{ userId: number; isAdmin: boolean } | null>(null);
  const [error, setError] = useState('');
  const base = owner && repo ? `/api/annotations/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` : null;

  const reload = useCallback(() => {
    if (!base) return;
    request<{ annotations: Annotation[]; userId: number; isAdmin: boolean }>(base)
      .then(body => { setNotes(body.annotations); setMe({ userId: body.userId, isAdmin: body.isAdmin }); setError(''); })
      .catch(e => setError(e.message));
  }, [base]);

  useEffect(() => { reload(); }, [reload]);

  const add = (path: string, body: string) => base
    ? request<Annotation>(base, { method: 'POST', body: JSON.stringify({ path, body }) }).then(note => { setNotes(list => [note, ...list]); return note; })
    : Promise.reject(new Error('No repository selected.'));
  const update = (id: number, change: { body?: string; resolved?: boolean }) =>
    request<Annotation>(`/api/annotations/${id}`, { method: 'PATCH', body: JSON.stringify(change) })
      .then(note => setNotes(list => list.map(n => (n.id === id ? note : n))));
  const remove = (id: number) =>
    request<void>(`/api/annotations/${id}`, { method: 'DELETE' }).then(() => setNotes(list => list.filter(n => n.id !== id)));

  return { notes, me, error, add, update, remove, reload };
}
