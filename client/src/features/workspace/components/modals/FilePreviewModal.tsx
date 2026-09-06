import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../../shared/components/Icon';
import { getFilePreviewIconName, highlightSyntax } from '../../../analysis/services/parser';

const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript', jsx: 'JavaScript (JSX)', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript (TSX)',
  py: 'Python', pyw: 'Python', pyi: 'Python',
  java: 'Java', kt: 'Kotlin', scala: 'Scala', cs: 'C#', go: 'Go',
  html: 'HTML', htm: 'HTML', vue: 'Vue', svelte: 'Svelte',
  css: 'CSS', scss: 'Sass', sass: 'Sass', less: 'Less',
  rb: 'Ruby', rake: 'Ruby', php: 'PHP',
  json: 'JSON', yml: 'YAML', yaml: 'YAML', md: 'Markdown', sql: 'SQL',
  sh: 'Shell', bash: 'Shell', c: 'C', cpp: 'C++', h: 'C header', rs: 'Rust',
};

function languageForFilename(filename: string): string {
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_LABELS[ext] || (ext ? ext.toUpperCase() : 'Plain text');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FilePreviewState {
  path: string;
  filename: string;
  content: string | null;
  line: number | null;
  loading: boolean;
  error: string | null;
}

interface Props {
  filePreview: FilePreviewState;
  onClose: () => void;
}

export default function FilePreviewModal({ filePreview, onClose }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Scroll to highlighted line after file preview loads
  useEffect(() => {
    if (filePreview && filePreview.content && filePreview.line && contentRef.current) {
      setTimeout(() => {
        const el = contentRef.current!.querySelector('.file-preview-line.highlighted');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [filePreview]);

  useEffect(() => { setCopied(false); }, [filePreview.path]);

  const lines = filePreview.content ? filePreview.content.split('\n') : [];
  const language = languageForFilename(filePreview.filename);

  function handleCopy() {
    if (!filePreview.content) return;
    navigator.clipboard?.writeText(filePreview.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="file-preview-overlay" onClick={onClose}>
      <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="file-preview-header">
          <div className="file-preview-title">
            <span className="file-preview-icon"><Icon name={getFilePreviewIconName(filePreview.filename)} size="l" /></span>
            <div className="file-preview-title-text">
              <span className="file-preview-name">{filePreview.filename}</span>
              <span className="file-preview-path">{filePreview.path}</span>
            </div>
          </div>
          <div className="file-preview-actions">
            {!filePreview.loading && !filePreview.error && filePreview.content && (
              <>
                <span className="file-preview-badge file-preview-badge-lang">{language}</span>
                <span className="file-preview-badge">{lines.length} lines</span>
                <span className="file-preview-badge">{formatBytes(filePreview.content.length)}</span>
              </>
            )}
            {filePreview.line && <span className="file-preview-badge file-preview-badge-line">Line {filePreview.line}</span>}
            {!filePreview.loading && !filePreview.error && filePreview.content && (
              <button className="file-preview-copy" onClick={handleCopy} title="Copy file contents">
                <Icon name={copied ? 'check' : 'copy'} size="s" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
            <button className="file-preview-close" onClick={onClose} title="Close">×</button>
          </div>
        </div>
        <div className="file-preview-content" ref={contentRef}>
          {filePreview.loading ? (
            <div className="file-preview-loading">
              <div className="spinner" />
              <div className="file-preview-loading-text">Loading file...</div>
            </div>
          ) : filePreview.error ? (
            <div className="file-preview-error">
              <Icon name="warning" size="xxl" className="file-preview-error-icon" />
              <div>{filePreview.error}</div>
            </div>
          ) : filePreview.content ? (
            <pre className="file-preview-code">
              {highlightSyntax(filePreview.content, filePreview.filename).map((lineHtml, i) => {
                const lineNum = i + 1;
                const isHighlighted = filePreview.line && lineNum === filePreview.line;
                return (
                  <div key={i} className={'file-preview-line' + (isHighlighted ? ' highlighted' : '')}>
                    <span className="file-preview-linenum">{lineNum}</span>
                    <span className="file-preview-text" dangerouslySetInnerHTML={{ __html: lineHtml || ' ' }} />
                  </div>
                );
              })}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
