'use client';

import { useState, useEffect } from 'react';
import TreeNode from './TreeNode';
import CardView from './CardView';

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

interface TreeViewProps {
  items: IItemTree[];
  loading: boolean;
  projectId: string;
  onItemUpdate: (itemId: string, data: Record<string, unknown>) => void;
  onItemDelete: (itemId: string) => void;
  onBulkDelete: (itemIds: string[] | 'all') => void;
  onBulkStatus: (status: string) => void;
  onTreeRefresh: (tree: IItemTree[]) => void;
  onCleanup?: () => void;
  cleaning?: boolean;
}

type ViewMode = 'tree' | 'card';

function collectIds(item: IItemTree): string[] {
  return [item.id, ...item.children.flatMap(collectIds)];
}

function filterDone(items: IItemTree[]): IItemTree[] {
  return items
    .filter(item => item.status !== 'done')
    .map(item => ({
      ...item,
      children: filterDone(item.children),
    }));
}

export default function TreeView({ items, loading, projectId, onItemUpdate, onItemDelete, onBulkDelete, onBulkStatus, onTreeRefresh, onCleanup, cleaning }: TreeViewProps) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideDone, setHideDone] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('im-hide-done') !== 'false';
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem('im-hide-done', String(hideDone));
  }, [hideDone]);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [collapseAll, setCollapseAll] = useState(false);
  const [collapseKey, setCollapseKey] = useState(0);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    onBulkDelete(ids);
    setSelected(new Set());
    setSelectMode(false);
  };

  const handleDeleteAll = () => {
    onBulkDelete('all');
    setSelected(new Set());
    setSelectMode(false);
  };

  const handleSelectAll = () => {
    const allIds = items.flatMap(collectIds);
    setSelected(new Set(allIds));
  };

  const totalCount = items.reduce((sum, item) => sum + 1 + countChildren(item), 0);
  const doneCount = countByStatus(items, 'done');
  const displayItems = hideDone ? filterDone(items) : items;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">구조화 뷰</h2>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground/60">{totalCount}</span>
          )}
          {doneCount > 0 && (
            <button
              onClick={() => setHideDone(!hideDone)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                hideDone
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              }`}
              title={hideDone ? '완료 항목 표시' : '완료 항목 숨기기'}
            >
              {hideDone ? `+${doneCount} 숨김` : `${doneCount} 완료`}
            </button>
          )}
          {loading && (
            <span className="text-xs text-accent animate-pulse">AI 분석 중...</span>
          )}
          {cleaning && !loading && (
            <span className="text-xs text-muted-foreground animate-pulse">정리 중...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="view-toggle">
            <button
              onClick={() => setViewMode('card')}
              className={`view-toggle-btn ${viewMode === 'card' ? 'view-toggle-btn-active' : ''}`}
            >
              카드
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`view-toggle-btn ${viewMode === 'tree' ? 'view-toggle-btn-active' : ''}`}
            >
              트리
            </button>
          </div>

          {items.length > 0 && viewMode === 'tree' && (
            <div className="flex items-center gap-1">
              {selectMode ? (
                <>
                  <button
                    onClick={handleSelectAll}
                    className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  >
                    전체선택
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selected.size === 0}
                    className="text-xs px-2 py-1 text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-30"
                  >
                    선택삭제 ({selected.size})
                  </button>
                  <button
                    onClick={() => { setSelectMode(false); setSelected(new Set()); }}
                    className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  {onCleanup && (
                    <button
                      onClick={onCleanup}
                      disabled={cleaning || loading}
                      className="text-xs px-2 py-1 text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-30"
                    >
                      정리
                    </button>
                  )}
                  <button
                    onClick={() => { setCollapseAll(!collapseAll); setCollapseKey(k => k + 1); }}
                    className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title={collapseAll ? '전체 펼치기' : '전체 접기'}
                  >
                    {collapseAll ? '펼치기' : '접기'}
                  </button>
                  <button
                    onClick={() => onBulkStatus('done')}
                    className="text-xs px-2 py-1 text-success hover:bg-success/10 rounded transition-colors"
                  >
                    전체완료
                  </button>
                  <button
                    onClick={() => setSelectMode(true)}
                    className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  >
                    선택
                  </button>
                  <button
                    onClick={handleDeleteAll}
                    className="text-xs px-2 py-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                  >
                    전체삭제
                  </button>
                </>
              )}
            </div>
          )}

          {items.length > 0 && viewMode === 'card' && (
            <div className="flex items-center gap-1">
              {onCleanup && (
                <button
                  onClick={onCleanup}
                  disabled={cleaning || loading}
                  className="text-xs px-2 py-1 text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-30"
                >
                  정리
                </button>
              )}
              <button
                onClick={() => onBulkStatus('done')}
                className="text-xs px-2 py-1 text-success hover:bg-success/10 rounded transition-colors"
              >
                전체완료
              </button>
              <button
                onClick={handleDeleteAll}
                className="text-xs px-2 py-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
              >
                전체삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {displayItems.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
            {items.length > 0 && hideDone ? (
              <>
                <div className="text-4xl mb-3">&#x2705;</div>
                <p className="mb-2">모든 항목이 완료되었습니다</p>
                <button
                  onClick={() => setHideDone(false)}
                  className="text-xs text-accent hover:underline"
                >
                  완료 항목 보기
                </button>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">&#x1F5C2;</div>
                <p className="mb-2">아직 구조화된 항목이 없습니다</p>
                <p className="text-xs text-center">
                  왼쪽 패널에서 아이디어를 입력해보세요.
                  <br />
                  입력을 멈추면 3초 후 AI가 자동으로 구조화합니다.
                </p>
              </>
            )}
          </div>
        ) : viewMode === 'card' ? (
          <CardView
            items={displayItems}
            onItemUpdate={onItemUpdate}
            onItemDelete={onItemDelete}
          />
        ) : (
          <div className="p-2">
            {displayItems.map((item) => (
              <TreeNode
                key={`${item.id}-${collapseKey}`}
                item={item}
                depth={0}
                projectId={projectId}
                onItemUpdate={onItemUpdate}
                onItemDelete={onItemDelete}
                onTreeRefresh={onTreeRefresh}
                selectMode={selectMode}
                selected={selected}
                onToggleSelect={toggleSelect}
                defaultExpanded={!collapseAll}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function countChildren(item: IItemTree): number {
  return item.children.reduce((sum, child) => sum + 1 + countChildren(child), 0);
}

function countByStatus(items: IItemTree[], status: string): number {
  let count = 0;
  for (const item of items) {
    if (item.status === status) count++;
    count += countByStatus(item.children, status);
  }
  return count;
}
