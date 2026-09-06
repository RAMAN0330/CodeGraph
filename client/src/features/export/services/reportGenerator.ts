import { calcHealth } from '../../repository/services/github';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateReport(format: 'json' | 'md' | 'txt', data: any, repoInfo: any, localDirHandle: any) {
  if (!data) return;
  const repo = repoInfo ? (localDirHandle ? 'Local Folder' : repoInfo.owner + '/' + repoInfo.repo) : 'Unknown Repository';
  const h = calcHealth(data);
  const report = {
    repository: repo,
    analyzedAt: new Date().toISOString(),
    graphkeepVersion: '1.0',
    summary: {
      healthScore: h.score,
      healthGrade: h.grade,
      totalFiles: data.stats.files,
      totalFunctions: data.stats.functions,
      totalConnections: data.stats.connections,
      linesOfCode: data.stats.loc,
      unusedFunctions: data.stats.dead,
      securityIssues: data.securityIssues.length,
      patterns: data.patterns.length,
      duplicates: data.stats.duplicates || 0,
      layerViolations: data.stats.violations || 0,
      highSecurityIssues: data.stats.security || 0,
    },
    files: data.files.map((f: any) => {
      const fns = f.functions.map((fn: any) => {
        const st = data.fnStats[fn.name];
        return {
          name: fn.name,
          line: fn.line,
          internalCalls: st ? st.internal : 0,
          externalCalls: st ? st.external : 0,
          totalCalls: st ? (st.internal + st.external) : 0,
          isUnused: st ? (st.internal + st.external === 0) : true,
          isExported: st ? st.isExported : false,
          isClassMethod: st ? st.isClassMethod : false,
          isTopLevel: st ? st.isTopLevel : true,
          type: st ? st.type : 'function',
          callers: st && st.callers ? st.callers.map((c: any) => ({ file: c.file, name: c.name, count: c.count })) : [],
          code: fn.code,
        };
      });
      return {
        path: f.path,
        name: f.name,
        folder: f.folder,
        layer: f.layer,
        lines: f.lines,
        churn: f.churn || 0,
        isCode: f.isCode !== false,
        functions: fns,
        functionCount: f.functions.length,
      };
    }),
    unusedFunctions: data.deadFunctions.map((fn: any) => ({ name: fn.name, file: fn.file, folder: fn.folder, line: fn.line, codeLines: fn.codeLines, code: fn.code, extension: fn.ext })),
    dependencies: data.connections.map((c: any) => {
      const src = typeof c.source === 'object' ? c.source.id : c.source;
      const tgt = typeof c.target === 'object' ? c.target.id : c.target;
      return { from: src, to: tgt, function: c.fn, callCount: c.count };
    }),
    architectureIssues: data.issues.map((i: any) => ({ type: i.type, title: i.title, description: i.desc, affectedFiles: i.items ? i.items.map((x: any) => x.file || x.name) : [], affectedItems: i.items || [] })),
    patterns: data.patterns.map((p: any) => ({ name: p.name, description: p.desc, isAntiPattern: p.isAnti || false, severity: p.severity || 'info', icon: p.icon || '', files: p.files.map((f: any) => f.path || f.name), fileDetails: p.files || [], metrics: p.metrics || {} })),
    securityIssues: data.securityIssues.map((s: any) => ({ severity: s.severity, title: s.title, description: s.desc, file: s.file, path: s.path, line: s.line, code: s.code })),
    duplicates: data.duplicates || [],
    layerViolations: data.layerViolations || [],
    suggestions: data.suggestions || [],
    languageBreakdown: data.stats.languages || [],
    folderStructure: data.folders,
    functionStatistics: Object.keys(data.fnStats || {}).map((fnName: string) => {
      const st = data.fnStats[fnName];
      return {
        name: fnName,
        file: st.file,
        folder: st.folder,
        line: st.line,
        internalCalls: st.internal,
        externalCalls: st.external,
        totalCalls: st.count || (st.internal + st.external),
        isExported: st.isExported,
        isClassMethod: st.isClassMethod,
        isTopLevel: st.isTopLevel,
        type: st.type,
        callers: st.callers ? st.callers.map((c: any) => ({ file: c.file, name: c.name, count: c.count })) : [],
        code: st.code,
      };
    }),
  };

  if (format === 'json') {
    download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), 'graphkeep-report.json');
  } else if (format === 'md') {
    let md = '# GraphKeep Analysis Report\n\n';
    md += '**Repository:** ' + repo + '\n';
    md += '**Analyzed:** ' + new Date().toLocaleString() + '\n\n';
    md += '## Summary\n\n';
    md += '| Metric | Value |\n|--------|-------|\n';
    md += '| Health Score | ' + h.score + '/100 (' + h.grade + ') |\n';
    md += '| Files | ' + data.stats.files + ' |\n';
    md += '| Functions | ' + data.stats.functions + ' |\n';
    md += '| Lines of Code | ' + data.stats.loc.toLocaleString() + ' |\n';
    md += '| Dependencies | ' + data.stats.connections + ' |\n';
    md += '| Unused Functions | ' + data.stats.dead + ' |\n';
    md += '| Security Issues | ' + data.securityIssues.length + ' |\n\n';
    if (data.securityIssues.length > 0) {
      md += '## Security Issues\n\n';
      data.securityIssues.forEach((s: any) => {
        md += '### ' + s.severity.toUpperCase() + ': ' + s.title + '\n';
        md += '- **File:** `' + s.path + '`' + (s.line ? ' (line ' + s.line + ')' : '') + '\n';
        md += '- **Description:** ' + s.desc + '\n';
        if (s.code) md += '- **Code:** `' + s.code + '`\n';
        md += '\n';
      });
    }
    if (data.deadFunctions.length > 0) {
      md += '## Unused Functions (' + data.deadFunctions.length + ')\n\n';
      md += 'These functions have zero calls (internal or external) and may be dead code:\n\n';
      data.deadFunctions.slice(0, 50).forEach((fn: any) => {
        md += '### `' + fn.name + '()`\n';
        md += '- **File:** `' + fn.file + '`\n';
        md += '- **Line:** ' + fn.line + '\n';
        md += '- **Lines of code:** ' + fn.codeLines + '\n';
        if (fn.code) md += '```\n' + fn.code + '\n```\n';
        md += '\n';
      });
      if (data.deadFunctions.length > 50) md += '\n*...and ' + (data.deadFunctions.length - 50) + ' more unused functions*\n\n';
    }
    if (data.patterns.length > 0) {
      md += '## Design Patterns\n\n';
      data.patterns.filter((p: any) => !p.isAnti).forEach((p: any) => {
        md += '### ' + p.name + '\n';
        md += p.desc + '\n\n';
        md += '**Files:** ' + p.files.slice(0, 5).map((f: any) => '`' + f.name + '`').join(', ') + (p.files.length > 5 ? ' (+' + (p.files.length - 5) + ' more)' : '') + '\n\n';
      });
      const antiPatterns = data.patterns.filter((p: any) => p.isAnti);
      if (antiPatterns.length > 0) {
        md += '## Anti-Patterns\n\n';
        antiPatterns.forEach((p: any) => {
          md += '### ' + p.name + '\n';
          md += p.desc + '\n\n';
          md += '**Affected files:** ' + p.files.slice(0, 5).map((f: any) => '`' + f.name + '`').join(', ') + '\n\n';
        });
      }
    }
    if (data.issues.length > 0) {
      md += '## Architecture Issues\n\n';
      data.issues.forEach((i: any) => {
        md += '### ' + i.title + '\n';
        md += i.desc + '\n\n';
        if (i.items) md += '**Affected:** ' + i.items.slice(0, 5).map((x: any) => '`' + (x.name || x.file) + '`').join(', ') + '\n\n';
      });
    }
    md += '## File Details\n\n';
    md += '| File | Folder | Layer | Lines | Functions |\n';
    md += '|------|--------|-------|-------|----------|\n';
    data.files.slice(0, 100).forEach((f: any) => {
      md += '| `' + f.name + '` | ' + f.folder + ' | ' + f.layer + ' | ' + f.lines + ' | ' + f.functions.length + ' |\n';
    });
    if (data.files.length > 100) md += '\n*...and ' + (data.files.length - 100) + ' more files*\n';
    download(new Blob([md], { type: 'text/markdown' }), 'graphkeep-report.md');
  } else if (format === 'txt') {
    let txt = 'GRAPHKEEP ANALYSIS REPORT\n';
    txt += '========================\n\n';
    txt += 'Repository: ' + repo + '\n';
    txt += 'Analyzed: ' + new Date().toLocaleString() + '\n\n';
    txt += 'SUMMARY\n-------\n';
    txt += 'Health Score: ' + h.score + '/100 (Grade: ' + h.grade + ')\n';
    txt += 'Files: ' + data.stats.files + '\n';
    txt += 'Functions: ' + data.stats.functions + '\n';
    txt += 'Lines of Code: ' + data.stats.loc.toLocaleString() + '\n';
    txt += 'Dependencies: ' + data.stats.connections + '\n';
    txt += 'Unused Functions: ' + data.stats.dead + '\n';
    txt += 'Security Issues: ' + data.securityIssues.length + '\n\n';
    if (data.securityIssues.length > 0) {
      txt += 'SECURITY ISSUES\n---------------\n';
      data.securityIssues.forEach((s: any, i: number) => {
        txt += (i + 1) + '. [' + s.severity.toUpperCase() + '] ' + s.title + '\n';
        txt += '   File: ' + s.path + (s.line ? ' (line ' + s.line + ')' : '') + '\n';
        txt += '   ' + s.desc + '\n';
        if (s.code) txt += '   Code: ' + s.code + '\n';
        txt += '\n';
      });
    }
    if (data.deadFunctions.length > 0) {
      txt += 'UNUSED FUNCTIONS (' + data.deadFunctions.length + ')\n' + '-'.repeat(20) + '\n';
      txt += 'These functions are never called and may be dead code:\n\n';
      data.deadFunctions.forEach((fn: any, i: number) => {
        txt += (i + 1) + '. ' + fn.name + '()\n';
        txt += '   File: ' + fn.file + ' (line ' + fn.line + ')\n';
        txt += '   Lines: ' + fn.codeLines + '\n';
        if (fn.code) { txt += '   Code:\n'; fn.code.split('\n').forEach((line: string) => { txt += '      ' + line + '\n'; }); }
        txt += '\n';
      });
    }
    if (data.patterns.length > 0) {
      txt += 'PATTERNS DETECTED\n-----------------\n';
      data.patterns.forEach((p: any) => {
        txt += (p.isAnti ? '[ANTI-PATTERN] ' : '') + p.name + '\n';
        txt += '  ' + p.desc + '\n';
        txt += '  Files: ' + p.files.map((f: any) => f.name).join(', ') + '\n\n';
      });
    }
    if (data.issues.length > 0) {
      txt += 'ARCHITECTURE ISSUES\n-------------------\n';
      data.issues.forEach((i: any) => {
        txt += '[' + i.type.toUpperCase() + '] ' + i.title + '\n';
        txt += '  ' + i.desc + '\n';
        if (i.items) txt += '  Affected: ' + i.items.map((x: any) => x.name || x.file).join(', ') + '\n';
        txt += '\n';
      });
    }
    txt += 'FILE LIST\n---------\n';
    data.files.forEach((f: any) => {
      txt += f.path + ' (' + f.lines + ' lines, ' + f.functions.length + ' functions, ' + f.layer + ')\n';
    });
    txt += '\nDEPENDENCIES\n------------\n';
    data.connections.slice(0, 100).forEach((c: any) => {
      const src = typeof c.source === 'object' ? c.source.id : c.source;
      const tgt = typeof c.target === 'object' ? c.target.id : c.target;
      txt += src.split('/').pop() + ' -> ' + tgt.split('/').pop() + ' (' + c.fn + ': ' + c.count + ' calls)\n';
    });
    if (data.connections.length > 100) txt += '\n...and ' + (data.connections.length - 100) + ' more dependencies\n';
    download(new Blob([txt], { type: 'text/plain' }), 'graphkeep-report.txt');
  }
}
