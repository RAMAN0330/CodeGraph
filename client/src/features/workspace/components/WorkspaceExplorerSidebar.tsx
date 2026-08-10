import type { ReactNode } from 'react';
import { Icon } from '../../../shared/components/Icon';

interface Props {
  folderFilter: string | null;
  onClearFilter: () => void;
  children: ReactNode;
}

export default function WorkspaceExplorerSidebar({ folderFilter, onClearFilter, children }: Props) {
  return (
    <>
      <div className="explorer-sidebar-heading">
        <div className="sidebar-title">Explorer</div>
        {folderFilter && (
          <button className="top-btn" onClick={onClearFilter}>
            <Icon name="close" size="s" /> Clear {folderFilter}
          </button>
        )}
      </div>
      <div className="sidebar-scroll">{children}</div>
    </>
  );
}
