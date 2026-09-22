import { useState, useEffect } from 'react';
import { toMermaid, toPlantUML, toSVG, toShareLink } from '../services/exporters';
import type { GraphNode, GraphEdge, FilterState } from '../services/exporters';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface ExportModalProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  svgRef: React.RefObject<SVGElement | null>;
  repoUrl: string;
  filterState: FilterState;
  onClose: () => void;
}

type ExportTab = 'mermaid' | 'plantuml' | 'svg' | 'sharelink';

export default function ExportModal({ nodes, edges, svgRef, repoUrl, filterState, onClose }: ExportModalProps) {
  const [activeTab, setActiveTab] = useState<ExportTab>('mermaid');
  const [copied, setCopied] = useState(false);
  const [svgPreviewUrl, setSvgPreviewUrl] = useState<string>('');

  const mermaidText = toMermaid(nodes, edges);
  const plantumlText = toPlantUML(nodes, edges);
  const shareLink = toShareLink(repoUrl, filterState);

  useEffect(() => {
    if (activeTab === 'svg' && svgRef.current) {
      const svgStr = toSVG(svgRef.current as SVGElement);
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      setSvgPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [activeTab, svgRef]);

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadSVG() {
    if (!svgRef.current) return;
    const svgStr = toSVG(svgRef.current as SVGElement);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'structrace-graph.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { id: ExportTab; label: string }[] = [
    { id: 'mermaid', label: 'Mermaid' },
    { id: 'plantuml', label: 'PlantUML' },
    { id: 'svg', label: 'SVG' },
    { id: 'sharelink', label: 'Share Link' },
  ];

  const activeContent: Record<ExportTab, string> = {
    mermaid: mermaidText,
    plantuml: plantumlText,
    svg: '',
    sharelink: shareLink,
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          width: '640px',
          maxWidth: '95vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          padding: 0,
          gap: 0,
        }}
      >
        <DialogTitle className="sr-only">Export / Share</DialogTitle>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1rem' }}>Export / Share</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
          >
            ×
          </Button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 20px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          {tabs.map(tab => (
            <Button
              key={tab.id}
              variant="ghost"
              onClick={() => { setActiveTab(tab.id); setCopied(false); }}
              style={{
                background: activeTab === tab.id ? 'var(--surface-subtle)' : 'transparent',
                border: activeTab === tab.id ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderBottom: 'none',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRadius: '6px 6px 0 0',
                padding: '6px 14px',
                fontSize: '0.82rem',
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {activeTab === 'svg' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {svgPreviewUrl && (
                <img
                  src={svgPreviewUrl}
                  alt="Graph preview"
                  style={{ width: '100%', border: '1px solid var(--border-subtle)', borderRadius: '8px', background: 'var(--bg-canvas)', maxHeight: '300px', objectFit: 'contain' }}
                />
              )}
              <Button
                onClick={handleDownloadSVG}
                style={{ background: 'var(--color-success)', border: 'none', color: 'white', padding: '8px 18px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                Download SVG
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeTab === 'sharelink' && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                  Share this link to let others open Structrace with the same repository pre-loaded.
                </p>
              )}
              {activeTab === 'mermaid' && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                  Paste into GitHub markdown, Notion, or{' '}
                  <a href="https://mermaid.live" target="_blank" rel="noreferrer" style={{ color: 'var(--teal-500)' }}>mermaid.live</a>.
                </p>
              )}
              {activeTab === 'plantuml' && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                  Paste into Confluence, Jira, or{' '}
                  <a href="https://www.plantuml.com/plantuml/uml/" target="_blank" rel="noreferrer" style={{ color: 'var(--teal-500)' }}>plantuml.com</a>.
                </p>
              )}
              <Textarea
                readOnly
                value={activeContent[activeTab]}
                style={{
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  padding: '12px',
                  resize: 'vertical',
                  minHeight: '220px',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              <Button
                onClick={() => handleCopy(activeContent[activeTab])}
                style={{
                  background: copied ? '#e5f5e9' : 'var(--surface-subtle)',
                  border: `1px solid ${copied ? 'var(--color-success)' : 'var(--border-subtle)'}`,
                  color: copied ? 'var(--color-success)' : 'var(--text-primary)',
                  padding: '7px 16px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                  transition: 'all 0.15s',
                }}
              >
                {copied ? '✓ Copied!' : 'Copy to clipboard'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
