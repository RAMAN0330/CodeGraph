const fs = require('fs');
let p = fs.readFileSync('workspace_area_raw.js', 'utf8');

// Rename
p = p.replace('function App', 'export default function WorkspaceArea');

// Tags to strings
const tags = ['div', 'span', 'button', 'input', 'textarea', 'select', 'option', 'a', 'h1', 'h2', 'h3', 'p', 'img', 'svg', 'path', 'circle', 'text', 'marker', 'defs', 'line', 'polyline', 'rect', 'polygon', 'label'];
tags.forEach(t => {
    const re = new RegExp('React\\.createElement\\(' + t + ',', 'g');
    p = p.replace(re, "React.createElement('" + t + "',");
});

// Types
p = p.replace(/useState\(/g, 'useState<any>(');
p = p.replace(/function\s*\(([^)]*)\)/g, (match, args) => {
    if (args.includes(':')) return match;
    if (!args.trim()) return match;
    return 'function(' + args.split(',').map(a => a.trim() + ': any').join(', ') + ')';
});

// Fix window.showDirectoryPicker
p = p.replace(/window\.showDirectoryPicker/g, '(window as any).showDirectoryPicker');

// Cast data to any
p = p.replace(/data\./g, '(data as any).');
p = p.replace(/\(data\)/g, '(data as any)');

// Fix specific broken patterns I saw earlier
p = p.replace(/centers\[d\.folder\]/g, '(centers as any)[(d as any).folder]');

fs.writeFileSync('WorkspaceArea.transformed.tsx', p);
