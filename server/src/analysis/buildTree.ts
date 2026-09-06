// Ported from client/src/features/repository/services/github.ts's buildTree —
// groups a flat analyzed-files array into a folder tree for the workspace UI.
export function buildTree(files: any[]) {
  const root: any = { name: 'root', path: '', children: {}, files: [] };
  files.forEach(f => {
    const parts = f.folder && f.folder !== 'root' ? f.folder.split('/') : [];
    let cur = root;
    parts.forEach((p: string, i: number) => {
      const path = parts.slice(0, i + 1).join('/');
      if (!cur.children[p]) cur.children[p] = { name: p, path, children: {}, files: [] };
      cur = cur.children[p];
    });
    cur.files.push(f);
  });
  return root;
}
