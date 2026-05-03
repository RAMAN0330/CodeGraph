import type { FlatTreeNode } from '../types/repo';

export function flattenTree(
    node: any,
    expandedPaths: Set<string>,
    depth: number = 0,
    parentPath: string | null = null,
    result: FlatTreeNode[] = []
): FlatTreeNode[] {
    const isRoot = node.path === '';
    
    if (!isRoot) {
        result.push({
            path: node.path,
            name: node.name,
            depth,
            isDir: true,
            isOpen: expandedPaths.has(node.path),
            parentPath,
            count: countFiles(node)
        });
    }

    const isOpen = isRoot || expandedPaths.has(node.path);
    if (isOpen) {
        // Folders
        const childFolders = Object.values(node.children).sort((a: any, b: any) => a.name.localeCompare(b.name));
        childFolders.forEach((c: any) => {
            flattenTree(c, expandedPaths, isRoot ? 0 : depth + 1, node.path, result);
        });

        // Files
        if (node.files) {
            const sortedFiles = [...node.files].sort((a: any, b: any) => a.name.localeCompare(b.name));
            sortedFiles.forEach((f: any) => {
                result.push({
                    path: f.path,
                    name: f.name,
                    depth: isRoot ? 0 : depth + 1,
                    isDir: false,
                    isOpen: false,
                    parentPath: node.path
                });
            });
        }
    }

    return result;
}

function countFiles(n: any): number {
    return (n.files?.length || 0) + Object.values(n.children || {}).reduce((s: number, c: any) => s + countFiles(c), 0);
}
