'use client';

import { useState } from 'react';
import LockToggle from './LockToggle';
import StatusBadge from './StatusBadge';
import ItemDetail from './ItemDetail';
import RefinePopover from './RefinePopover';

interface IItemTree {
  id: string;
  project_id?: string;
  title: string;
  description: string;
  item_type: string;
  priority: string;
  status: string;
  is_locked: boolean;
  is_pinned: boolean;
  children: IItemTree[];
}

interface TreeNodeProps {
  item: IItemTree;
  depth: number;
  projectId: string;
  onItemUpdate: (itemId: string, data: Record<string, unknown>) => void;
  onItemDelete: (itemId: string) => void;
  onTreeRefresh: (tree: IItemTree[]) => void;
  selectMode?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  defaultExpanded?: boolean;
}

const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
  feature: { icon: '\u{1F4E6}', color: 'var(--primary)', label: '기능' },
  task:    { icon: '\u{2705}', color: 'var(--success)', label: '작업' },
  bug:     { icon: '\u{1F41B}', color: 'var(--destructive)', label: '버그' },
  idea:    { icon: '\u{1F4A1}', color: 'var(--warning)', label: '아이디어' },
  note:    { icon: '\u{1F4DD}', color: 'var(--muted-foreground)', label: '메모' },
};

function countDescendantStatus(item: IItemTree): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const child of item.children) {
    total++;
    if (child.status === 'done') done++;
    const sub = countDescendantStatus(child);
    total += sub.total;
    done += sub.done;
  }
  return { total, done };
}

export default function TreeNode({ item, depth, projectId, onItemUpdate, onItemDelete, onTreeRefresh, selectMode, selected, onToggleSelect, defaultExpanded }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? depth < 2);
  const [showDetail, setShowDetail] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const hasChildren = item.children.length > 0;
  const baseCfg = typeConfig[item.item_type] || typeConfig.note;
  const cfg = item.status === 'done'
    ? { icon: '\u{2705}', color: 'var(--success)', label: baseCfg.label }
    : item.status === 'in_progress'
      ? { ...baseCfg, color: 'var(--primary)' }
      : baseCfg;
  const childStats = hasChildren ? countDescendantStatus(item) : null;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onItemDelete(item.id);
  };

  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onItemUpdate(item.id, { is_pinned: !item.is_pinned });
  };

  const handleRefineToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRefine(!showRefine);
  };

  const isDone = item.status === 'done';

  return (
    <div className="select-none">
      <div
        className={`tree-node-row group ${isDone ? 'opacity-50' : ''}`}
        style={{
          paddingLeft: `${depth * 20 + 8}px`,
          borderLeft: depth === 0 ? `3px solid hsl(${cfg.color})` : undefined,
        }}
        onClick={() => selectMode ? onToggleSelect?.(item.id) : setShowDetail(!showDetail)}
      >
        {selectMode && (
          <input
            type="checkbox"
            checked={selected?.has(item.id) ?? false}
            onChange={() => onToggleSelect?.(item.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-3.5 h-3.5 flex-shrink-0 accent-accent"
          />
        )}

        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-muted-foreground hover:text-foreground text-[10px] w-4 flex-shrink-0 transition-transform"
            style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            ▼
          </button>
        ) : (
          <span className="w-4 flex-shrink-0 text-center text-muted-foreground/30 text-[10px]">·</span>
        )}

        {/* Main content area */}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm flex-shrink-0">{cfg.icon}</span>
            <span className={`text-sm truncate ${isDone ? 'line-through' : ''}`}>
              {item.title}
            </span>
            {item.is_pinned && (
              <span className="text-[10px] flex-shrink-0" title="고정됨">📌</span>
            )}
            {/* Child progress */}
            {childStats && childStats.total > 0 && (
              <span className="tree-progress-badge flex-shrink-0">
                {childStats.done}/{childStats.total}
              </span>
            )}
          </div>
          {/* Description subtitle */}
          {item.description && !showDetail && (
            <p className="text-[11px] text-muted-foreground/50 truncate mt-0.5 leading-tight">
              {item.description}
            </p>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Hover actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <LockToggle
              isLocked={item.is_locked}
              onToggle={(locked) => onItemUpdate(item.id, { is_locked: locked })}
            />
            <button onClick={handlePinToggle} className="tree-icon-btn" title={item.is_pinned ? '고정 해제' : '고정'}>
              {item.is_pinned ? '📌' : '📍'}
            </button>
            <button onClick={handleRefineToggle} className="tree-action-btn" title="다듬기">
              다듬기
            </button>
            <button onClick={handleDelete} className="tree-action-btn tree-action-btn-danger" title="삭제">
              ✕
            </button>
          </div>

          {/* Always visible: priority + status */}
          <span className="tree-priority-dot" style={{
            background: item.priority === 'high' ? 'hsl(var(--destructive))'
              : item.priority === 'medium' ? 'hsl(var(--warning))'
              : 'hsl(var(--success))'
          }} title={item.priority} />
          <StatusBadge
            status={item.status}
            onStatusChange={(status) => onItemUpdate(item.id, { status })}
          />
        </div>
      </div>

      {showRefine && (
        <div style={{ marginLeft: `${depth * 20 + 28}px` }}>
          <RefinePopover
            itemId={item.id}
            projectId={projectId}
            title={item.title}
            description={item.description}
            onClose={() => setShowRefine(false)}
            onItemUpdate={onItemUpdate}
            onTreeRefresh={onTreeRefresh}
          />
        </div>
      )}

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
        <div className={depth === 0 ? 'tree-children-group' : ''}>
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              depth={depth + 1}
              projectId={projectId}
              onItemUpdate={onItemUpdate}
              onItemDelete={onItemDelete}
              onTreeRefresh={onTreeRefresh}
              selectMode={selectMode}
              selected={selected}
              onToggleSelect={onToggleSelect}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}
