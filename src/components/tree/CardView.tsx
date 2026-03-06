'use client';

import { useState } from 'react';
import StatusBadge from './StatusBadge';

interface IItemTree {
  id: string;
  title: string;
  description: string;
  item_type: string;
  priority: string;
  status: string;
  is_locked: boolean;
  is_pinned: boolean;
  children: IItemTree[];
}

interface CardViewProps {
  items: IItemTree[];
  onItemUpdate: (itemId: string, data: Record<string, unknown>) => void;
  onItemDelete: (itemId: string) => void;
}

const typeConfig: Record<string, { icon: string; color: string }> = {
  feature: { icon: '\u{1F4E6}', color: 'var(--primary)' },
  task:    { icon: '\u{2705}', color: 'var(--success)' },
  bug:     { icon: '\u{1F41B}', color: 'var(--destructive)' },
  idea:    { icon: '\u{1F4A1}', color: 'var(--warning)' },
  note:    { icon: '\u{1F4DD}', color: 'var(--muted-foreground)' },
};

function countAll(items: IItemTree[]): { total: number; done: number; inProgress: number; pending: number } {
  let total = 0, done = 0, inProgress = 0, pending = 0;
  for (const item of items) {
    total++;
    if (item.status === 'done') done++;
    else if (item.status === 'in_progress') inProgress++;
    else pending++;
    const sub = countAll(item.children);
    total += sub.total;
    done += sub.done;
    inProgress += sub.inProgress;
    pending += sub.pending;
  }
  return { total, done, inProgress, pending };
}

function flattenChildren(item: IItemTree, maxDepth = 2, depth = 0): { item: IItemTree; depth: number }[] {
  const result: { item: IItemTree; depth: number }[] = [];
  for (const child of item.children) {
    result.push({ item: child, depth });
    if (child.children.length > 0 && depth < maxDepth - 1) {
      result.push(...flattenChildren(child, maxDepth, depth + 1));
    }
  }
  return result;
}

function ProjectCard({ item, onItemUpdate, onItemDelete }: {
  item: IItemTree;
  onItemUpdate: CardViewProps['onItemUpdate'];
  onItemDelete: CardViewProps['onItemDelete'];
}) {
  const [expanded, setExpanded] = useState(false);
  const baseCfg = typeConfig[item.item_type] || typeConfig.note;
  const isDone = item.status === 'done';
  const cfg = isDone
    ? { icon: '\u{2705}', color: 'var(--success)' }
    : item.status === 'in_progress'
      ? { icon: baseCfg.icon, color: 'var(--primary)' }
      : baseCfg;
  const stats = countAll(item.children);
  const totalWithSelf = stats.total + 1;
  const doneWithSelf = stats.done + (isDone ? 1 : 0);
  const progressPct = totalWithSelf > 0 ? (doneWithSelf / totalWithSelf) * 100 : 0;
  const flatChildren = flattenChildren(item);
  const hasMore = flatChildren.length > 5;
  const displayChildren = expanded ? flatChildren : flatChildren.slice(0, 5);

  const progressColor = progressPct === 100 ? 'hsl(var(--success))'
    : progressPct > 50 ? 'hsl(var(--primary))'
    : 'hsl(var(--accent))';

  return (
    <div className="project-card" style={{ borderTopColor: `hsl(${cfg.color})`, borderTopWidth: '3px' }}>
      <div className="project-card-header group">
        <span className="project-card-icon">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="project-card-title">{item.title}</div>
        </div>
        <button
          onClick={() => onItemDelete(item.id)}
          className="text-[10px] text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity px-1"
          title="삭제"
        >
          ✕
        </button>
        <StatusBadge
          status={item.status}
          onStatusChange={(status) => onItemUpdate(item.id, { status })}
        />
      </div>

      {item.description && (
        <p className="project-card-desc">{item.description}</p>
      )}

      {/* Progress bar */}
      {stats.total > 0 && (
        <div className="project-card-progress">
          <div
            className="project-card-progress-fill"
            style={{ width: `${progressPct}%`, background: progressColor }}
          />
        </div>
      )}

      {/* Stats */}
      <div className="project-card-stats">
        {stats.done > 0 && (
          <span className="project-card-stat">
            <span style={{ color: 'hsl(var(--success))' }}>●</span> {stats.done} 완료
          </span>
        )}
        {stats.inProgress > 0 && (
          <span className="project-card-stat">
            <span style={{ color: 'hsl(var(--primary))' }}>●</span> {stats.inProgress} 진행
          </span>
        )}
        {stats.pending > 0 && (
          <span className="project-card-stat">
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>●</span> {stats.pending} 대기
          </span>
        )}
        <span className="ml-auto">{stats.total}개 항목</span>
      </div>

      {/* Children list */}
      {displayChildren.length > 0 && (
        <div className="project-card-children">
          {displayChildren.map(({ item: child, depth }) => {
            const childBaseCfg = typeConfig[child.item_type] || typeConfig.note;
            const childIcon = child.status === 'done' ? '\u{2705}' : childBaseCfg.icon;
            const isDone = child.status === 'done';
            return (
              <div
                key={child.id}
                className={`project-card-child group/child ${isDone ? 'project-card-child-done' : ''}`}
                style={{ paddingLeft: `${14 + depth * 16}px` }}
              >
                <span className="text-[11px]">{childIcon}</span>
                <span className="flex-1 truncate">{child.title}</span>
                <button
                  onClick={() => onItemDelete(child.id)}
                  className="text-[10px] text-muted-foreground/30 hover:text-destructive opacity-0 group-hover/child:opacity-100 transition-opacity px-0.5"
                >
                  ✕
                </button>
                <span className="tree-priority-dot flex-shrink-0" style={{
                  background: child.priority === 'high' ? 'hsl(var(--destructive))'
                    : child.priority === 'medium' ? 'hsl(var(--warning))'
                    : 'hsl(var(--success))'
                }} />
                <StatusBadge
                  status={child.status}
                  onStatusChange={(status) => onItemUpdate(child.id, { status })}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Expand toggle */}
      {hasMore && (
        <div className="project-card-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? '접기' : `+${flatChildren.length - 5}개 더 보기`}
        </div>
      )}
    </div>
  );
}

export default function CardView({ items, onItemUpdate, onItemDelete }: CardViewProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-4xl mb-3">&#x1F5C2;</div>
        <p>아직 구조화된 항목이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="card-grid">
      {items.map((item) => (
        <ProjectCard
          key={item.id}
          item={item}
          onItemUpdate={onItemUpdate}
          onItemDelete={onItemDelete}
        />
      ))}
    </div>
  );
}
