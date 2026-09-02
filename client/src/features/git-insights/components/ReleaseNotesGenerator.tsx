import React, { useState, useEffect } from 'react';

interface CommitItem {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string } | null;
}

interface TagItem {
  name: string;
  commit: { sha: string };
}

type Category = 'Features' | 'Bug Fixes' | 'Documentation' | 'Other' | 'Uncategorized';

interface CategorizedCommit {
  sha7: string;
  message: string;
  author: string;
  category: Category;
}

interface ReleaseNotesGeneratorProps {
  owner: string;
  repo: string;
  token: string;
}

function categorize(message: string): Category {
  const lower = message.toLowerCase();
  if (lower.startsWith('feat')) return 'Features';
  if (lower.startsWith('fix')) return 'Bug Fixes';
  if (lower.startsWith('docs')) return 'Documentation';
  if (lower.startsWith('chore') || lower.startsWith('refactor') || lower.startsWith('perf')) return 'Other';
  return 'Uncategorized';
}

function stripScope(message: string): string {
  // Remove conventional commit prefix like "feat(scope): " or "fix: "
  return message.replace(/^[a-z]+(\([^)]*\))?:\s*/i, '').trim();
}

const CATEGORY_ORDER: Category[] = ['Features', 'Bug Fixes', 'Documentation', 'Other', 'Uncategorized'];

export default function ReleaseNotesGenerator({ owner, repo, token }: ReleaseNotesGeneratorProps) {
  const [commits, setCommits] = useState<CategorizedCommit[]>([]);
  const [tagFrom, setTagFrom] = useState<string>('');
  const [tagTo, setTagTo] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<Category, boolean>>({} as any);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

        // Fetch tags
        const tagsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/tags?per_page=10`,
          { headers }
        );
        if (!tagsRes.ok) throw new Error(`GitHub API error fetching tags: ${tagsRes.status}`);
        const tags: TagItem[] = await tagsRes.json();

        let rawCommits: CommitItem[] = [];

        if (tags.length >= 2) {
          const base = tags[1].name;
          const head = tags[0].name;

          const compareRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
            { headers }
          );
          if (!compareRes.ok) throw new Error(`GitHub API error comparing tags: ${compareRes.status}`);
          const compareData = await compareRes.json();
          rawCommits = compareData.commits || [];

          if (!cancelled) {
            setTagFrom(base);
            setTagTo(head);
          }
        } else {
          // Fewer than 2 tags — fall back to last 30 commits
          const commitsRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`,
            { headers }
          );
          if (!commitsRes.ok) throw new Error(`GitHub API error fetching commits: ${commitsRes.status}`);
          rawCommits = await commitsRes.json();

          if (!cancelled && tags.length === 1) {
            setTagFrom('(start)');
            setTagTo(tags[0].name);
          }
        }

        if (!cancelled) {
          const categorized: CategorizedCommit[] = rawCommits.map((c) => ({
            sha7: c.sha.slice(0, 7),
            message: stripScope(c.commit.message.split('\n')[0]),
            author: c.author?.login || c.commit.author.name,
            category: categorize(c.commit.message),
          }));

          const firstDate = rawCommits[0]?.commit?.author?.date;
          if (firstDate) setToDate(new Date(firstDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

          setCommits(categorized);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to generate release notes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token]);

  function buildMarkdown(): string {
    const header = `## ${tagTo || 'Latest'} — ${toDate}\n\n`;
    const sections = CATEGORY_ORDER.map((cat) => {
      const items = commits.filter((c) => c.category === cat);
      if (!items.length) return '';
      return `### ${cat}\n${items.map((c) => `- ${c.message} (${c.sha7})`).join('\n')}\n`;
    }).filter(Boolean);
    return header + sections.join('\n');
  }

  function buildJson(): string {
    const grouped: Record<string, any[]> = {};
    for (const cat of CATEGORY_ORDER) {
      grouped[cat] = commits.filter((c) => c.category === cat).map((c) => ({
        sha: c.sha7,
        message: c.message,
        author: c.author,
      }));
    }
    return JSON.stringify({ version: tagTo || 'latest', date: toDate, changes: grouped }, null, 2);
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  const containerStyle: React.CSSProperties = {
    background: 'var(--surface-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: 24,
    color: 'var(--text-primary)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    maxWidth: 860,
  };

  if (loading) return <div style={containerStyle}><p style={{ color: 'var(--text-muted)' }}>Generating release notes...</p></div>;
  if (error) return <div style={containerStyle}><p style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>;

  const groupedCommits: Record<Category, CategorizedCommit[]> = {} as any;
  for (const cat of CATEGORY_ORDER) {
    groupedCommits[cat] = commits.filter((c) => c.category === cat);
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
            Release Notes Generator
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {tagFrom && tagTo
              ? `From ${tagFrom} → ${tagTo}`
              : 'Last 30 commits'}
            {toDate && ` · ${toDate}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => copyText(buildMarkdown(), 'md')}
            style={{
              padding: '6px 14px',
              background: copied === 'md' ? 'var(--color-success)' : 'var(--surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied === 'md' ? 'Copied!' : 'Copy Markdown'}
          </button>
          <button
            onClick={() => copyText(buildJson(), 'json')}
            style={{
              padding: '6px 14px',
              background: copied === 'json' ? 'var(--color-success)' : 'var(--surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied === 'json' ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {/* Categories */}
      {CATEGORY_ORDER.map((cat) => {
        const items = groupedCommits[cat];
        if (!items.length) return null;
        const isCollapsed = collapsed[cat];
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <button
              onClick={() => setCollapsed((prev) => ({ ...prev, [cat]: !isCollapsed }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border-subtle)',
                padding: '8px 0',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.15s' }}>▼</span>
              {cat}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                {items.length} commit{items.length !== 1 ? 's' : ''}
              </span>
            </button>
            {!isCollapsed && (
              <ul style={{ margin: '8px 0 0', padding: '0 0 0 20px', listStyle: 'disc' }}>
                {items.map((c) => (
                  <li key={c.sha7} style={{ marginBottom: 6, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {c.message}
                    <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                      <code style={{ fontSize: 11, background: 'var(--surface-subtle)', padding: '1px 5px', borderRadius: 3, color: 'var(--color-info)' }}>{c.sha7}</code>
                      {' '}{c.author}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {commits.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No commits found for this range.</p>
      )}
    </div>
  );
}
