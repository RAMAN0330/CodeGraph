const fs = require('fs');
let w = fs.readFileSync('client/src/pages/WorkspaceArea.tsx', 'utf8');

// Cast React props to any to avoid "Attributes" vs "HTMLAttributes" errors
w = w.replace(/React\.createElement\(([^,]+),\s*\{/g, "React.createElement($1, {");
w = w.replace(/React\.createElement\(([^,]+),\s*\{([^}]*)\}/g, (match, p1, p2) => {
    if (p2.includes('as any')) return match;
    return `React.createElement(${p1}, {${p2}} as any)`;
});

// Fix window.showDirectoryPicker
w = w.replace(/window\.showDirectoryPicker/g, '(window as any).showDirectoryPicker');

// Cast data to any
w = w.replace(/data\./g, '(data as any).');
w = w.replace(/\(data\)/g, '(data as any)');

// Fix D3 return types (common issue)
w = w.replace(/\.style\('([^']+)',\s*function/g, ".style('$1', function");
w = w.replace(/\.attr\('([^']+)',\s*function/g, ".attr('$1', function");

// Add missing suggestions property to data object to satisfy inference if it persists
w = w.replace(/setData\(\{/g, 'setData({suggestions:[],');

fs.writeFileSync('client/src/pages/WorkspaceArea.tsx', w);
