import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  index: number;
  sha7: string;
  totalFiles: number;
  testFiles: number;
  debtFiles: number;
  isCurrent: boolean;
}

interface TechDebtTimelineProps {
  owner: string;
  repo: string;
  token: string;
  currentData: any;
}

export default function TechDebtTimeline({ owner, repo, token, currentData }: TechDebtTimelineProps) {
  const [points, setPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

        // Fetch last 10 commits
        const commitsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`,
          { headers }
        );
        if (!commitsRes.ok) throw new Error(`GitHub API error: ${commitsRes.status}`);
        const commits: any[] = await commitsRes.json();
        if (!Array.isArray(commits) || commits.length === 0) throw new Error('No commits found');

        // Reversed so oldest is index 0
        const chronological = [...commits].reverse();

        const dataPoints: DataPoint[] = [];

        for (let i = 0; i < chronological.length; i++) {
          if (cancelled) break;
          const commit = chronological[i];
          const sha = commit.sha;
          const isCurrent = i === chronological.length - 1;

          let totalFiles = 0;
          let testFiles = 0;
          let debtFiles = 0;

          if (isCurrent && currentData?.stats) {
            // Use already-analyzed data for current commit
            totalFiles = currentData.stats.files || 0;
            testFiles = (currentData.files || []).filter((f: any) => {
              const p = f.path || f.name || '';
              return p.includes('.test.') || p.includes('.spec.');
            }).length;
            debtFiles = (currentData.files || []).filter((f: any) => {
              const p = f.path || f.name || '';
              return /legacy|old_|temp_|hack|todo/i.test(p);
            }).length;
          } else {
            // Fetch tree for historical commits
            try {
              const treeRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
                { headers }
              );
              if (treeRes.ok) {
                const treeData = await treeRes.json();
                const blobs = (treeData.tree || []).filter((item: any) => item.type === 'blob');
                totalFiles = blobs.length;
                testFiles = blobs.filter((item: any) => item.path.includes('.test.') || item.path.includes('.spec.')).length;
                debtFiles = blobs.filter((item: any) => /legacy|old_|temp_|hack|todo/i.test(item.path)).length;
              }
            } catch {
              // Use 0 counts if tree fetch fails
            }
          }

          dataPoints.push({
            index: i,
            sha7: sha.slice(0, 7),
            totalFiles,
            testFiles,
            debtFiles,
            isCurrent,
          });
        }

        if (!cancelled) setPoints(dataPoints);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to build tech debt timeline');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token]);

  // D3 chart rendering
  useEffect(() => {
    if (!points.length || !svgRef.current) return;

    const W = 500, H = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', W).attr('height', H);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain([0, points.length - 1])
      .range([0, innerW]);

    const allValues = points.flatMap((p) => [p.totalFiles, p.testFiles, p.debtFiles]);
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allValues) || 1])
      .nice()
      .range([innerH, 0]);

    // Grid lines
    g.append('g')
      .attr('stroke', 'var(--bg3)')
      .attr('stroke-dasharray', '4,4')
      .call(d3.axisLeft(yScale).ticks(4).tickSize(-innerW).tickFormat(() => ''))
      .call((a) => a.select('.domain').remove());

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(points.length - 1).tickFormat((d) => {
        const pt = points[d as number];
        return pt ? pt.sha7 : '';
      }))
      .call((a) => {
        a.select('.domain').attr('stroke', 'var(--border)');
        a.selectAll('text').attr('fill', 'var(--t3)').attr('font-size', 10).attr('transform', 'rotate(-35)').attr('text-anchor', 'end');
        a.selectAll('.tick line').attr('stroke', 'var(--border)');
      });

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(4))
      .call((a) => {
        a.select('.domain').attr('stroke', 'var(--border)');
        a.selectAll('text').attr('fill', 'var(--t3)').attr('font-size', 10);
        a.selectAll('.tick line').attr('stroke', 'var(--border)');
      });

    // Line factory
    const lineGen = (key: keyof DataPoint) =>
      d3.line<DataPoint>()
        .x((d) => xScale(d.index))
        .y((d) => yScale(d[key] as number))
        .curve(d3.curveMonotoneX);

    const lines: { key: keyof DataPoint; color: string; label: string }[] = [
      { key: 'totalFiles', color: 'var(--acc)', label: 'Total Files' },
      { key: 'testFiles',  color: 'var(--green)', label: 'Test Files' },
      { key: 'debtFiles',  color: 'var(--orange)', label: 'Debt Files' },
    ];

    for (const { key, color } of lines) {
      g.append('path')
        .datum(points)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', lineGen(key) as any);

      // Circles
      g.selectAll(`.dot-${key}`)
        .data(points)
        .join('circle')
        .attr('class', `dot-${key}`)
        .attr('cx', (d) => xScale(d.index))
        .attr('cy', (d) => yScale(d[key] as number))
        .attr('r', (d) => d.isCurrent ? 6 : 3)
        .attr('fill', (d) => d.isCurrent ? 'var(--t0)' : color)
        .attr('stroke', color)
        .attr('stroke-width', (d) => d.isCurrent ? 2.5 : 1);
    }
  }, [points]);

  if (loading) return <div className="gi-page"><p className="gi-note">Building tech debt timeline…</p></div>;
  if (error) return <div className="gi-page"><p className="gi-note" style={{ color: 'var(--red)' }}>Error: {error}</p></div>;
  if (!points.length) return <div className="gi-page"><p className="gi-note">No data available.</p></div>;

  const stats = currentData?.stats || {};
  const summaryRows = [
    { label: 'Dead Functions',  value: stats.dead       ?? 0, color: 'var(--red)' },
    { label: 'Issues',          value: (currentData?.issues?.length) ?? 0, color: 'var(--orange)' },
    { label: 'Duplicates',      value: stats.duplicates ?? 0, color: 'var(--orange)' },
    { label: 'Security (High)', value: stats.security   ?? 0, color: 'var(--red)' },
  ];

  return (
    <div className="gi-page">
      <h1>Tech Debt Timeline</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--t3)' }}>
        File counts over last {points.length} commits. Current commit marked with white dot.
      </p>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
        {[
          { color: 'var(--acc)', label: 'Total Files' },
          { color: 'var(--green)', label: 'Test Files' },
          { color: 'var(--orange)', label: 'Debt Files' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t3)' }}>
            <div style={{ width: 24, height: 3, background: color, borderRadius: 2 }} />
            {label}
          </div>
        ))}
      </div>

      {/* D3 chart */}
      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <svg ref={svgRef} style={{ display: 'block' }} />
      </div>

      {/* Current snapshot summary table */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Current Snapshot
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {summaryRows.map(({ label, value, color }) => (
          <div key={label} style={{
            padding: '12px 16px',
            background: 'var(--bg3)',
            border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, color: 'var(--t3)' }}>{label}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
