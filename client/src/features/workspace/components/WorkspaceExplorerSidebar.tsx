import type { ReactNode } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { Button } from '@/components/ui/button';

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
          <Button variant="ghost" className="top-btn" onClick={onClearFilter}>
            <Icon name="close" size="s" /> Clear {folderFilter}
          </Button>
        )}
      </div>
      <div className="sidebar-scroll">{children}</div>
    </>
  );
}
