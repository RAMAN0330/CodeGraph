import { type ReactNode, type RefObject, useCallback, useEffect, useState } from 'react';
import { advanceGroupedGraphFocus, type GroupedGraphModel } from '../services/groupedGraph';

interface FocusHandle { focusNode(id: string): void }

interface Props {
  model: GroupedGraphModel;
  pendingPath: string | null;
  expandedFolders: ReadonlySet<string>;
  graphRef: RefObject<FocusHandle | null>;
  onExpandFolder(id: string): void;
  onPendingPathChange(path: string | null): void;
  children(onReady: () => void): ReactNode;
}

export default function GroupedGraphFocusController(props: Props) {
  const [readyVersion, setReadyVersion] = useState(0);
  const onReady = useCallback(() => setReadyVersion(value => value + 1), []);

  useEffect(() => {
    if (!props.pendingPath) return;
    const next = advanceGroupedGraphFocus(
      props.model,
      props.pendingPath,
      props.expandedFolders,
      props.graphRef.current ? id => props.graphRef.current?.focusNode(id) : null,
    );
    if (next.expandFolderId) props.onExpandFolder(next.expandFolderId);
    else if (next.pendingPath !== props.pendingPath) props.onPendingPathChange(next.pendingPath);
  }, [props.model, props.pendingPath, props.expandedFolders, props.graphRef, props.onExpandFolder, props.onPendingPathChange, readyVersion]);

  return props.children(onReady);
}
