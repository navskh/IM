'use client';

import { useState } from 'react';
import LockToggle from './LockToggle';
import StatusBadge from './StatusBadge';
import ItemDetail from './ItemDetail';

interface IItemTree {
  id: string;
  project_id?: string;
  title: string;
  description: string;
  item_type: string;
  priority: string;
  status: string;
  is_locked: boolean;
  children: IItemTree[];
}

interface TreeNodeProps {
  item: IItemTree;
  depth: number;
  projectId: string;
  onItemUpdate: (itemId: string, data: Record<string, unknown>) => void;
}

const typeIcons: Record<string, string> = {
  feature: '\u{1F4E6}',
  task: '\u{2705}',
  bug: '\u{1F41B}',
  idea: '\u{1F4A1}',
  note: '\u{1F4DD}',
};

const priorityColors: Record<string, string> = {
  high: 'text-destructive',
  medium: 'text-warning',
  low: 'text-success',
};

export default function TreeNode({ item, depth, projectId, onItemUpdate }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const hasChildren = item.children.length > 0;

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-card-hover
                   cursor-pointer transition-colors group"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => setShowDetail(!showDetail)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-muted-foreground hover:text-foreground text-xs w-4 flex-shrink-0"
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <LockToggle
          isLocked={item.is_locked}
          onToggle={(locked) => onItemUpdate(item.id, { is_locked: locked })}
        />

        <span className="text-sm flex-shrink-0">
          {typeIcons[item.item_type] || '\u{1F4CB}'}
        </span>

        <span className="text-sm flex-1 truncate">{item.title}</span>

        <span className={`text-xs flex-shrink-0 ${priorityColors[item.priority] || ''}`}>
          {item.priority === 'high' ? '\u{1F534}' : item.priority === 'medium' ? '\u{1F7E1}' : '\u{1F7E2}'}
        </span>

        <StatusBadge
          status={item.status}
          onStatusChange={(status) => onItemUpdate(item.id, { status })}
        />
      </div>

      {showDetail && (
        <ItemDetail
          itemId={item.id}
          projectId={projectId}
          title={item.title}
          description={item.description}
          itemType={item.item_type}
          priority={item.priority}
          status={item.status}
          isLocked={item.is_locked}
          depth={depth}
        />
      )}

      {expanded && hasChildren && (
        <div>
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              depth={depth + 1}
              projectId={projectId}
              onItemUpdate={onItemUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
