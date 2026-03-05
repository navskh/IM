'use client';

import TreeNode from './TreeNode';

interface IItemTree {
  id: string;
  title: string;
  description: string;
  item_type: string;
  priority: string;
  status: string;
  is_locked: boolean;
  children: IItemTree[];
}

interface TreeViewProps {
  items: IItemTree[];
  loading: boolean;
  projectId: string;
  onItemUpdate: (itemId: string, data: Record<string, unknown>) => void;
}

export default function TreeView({ items, loading, projectId, onItemUpdate }: TreeViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-sm font-medium text-muted-foreground">구조화 뷰</h2>
        {loading && (
          <span className="text-xs text-accent animate-pulse">
            AI 분석 중...
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-2">
        {items.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
            <div className="text-4xl mb-3">&#x1F5C2;</div>
            <p className="mb-2">아직 구조화된 항목이 없습니다</p>
            <p className="text-xs text-center">
              왼쪽 패널에서 아이디어를 입력해보세요.
              <br />
              입력을 멈추면 3초 후 AI가 자동으로 구조화합니다.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <TreeNode
              key={item.id}
              item={item}
              depth={0}
              projectId={projectId}
              onItemUpdate={onItemUpdate}
            />
          ))
        )}
      </div>
    </div>
  );
}
