'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Editor from '@/components/brainstorm/Editor';
import TreeView from '@/components/tree/TreeView';
import ChatPanel from '@/components/chat/ChatPanel';
import ResizeHandle from '@/components/brainstorm/ResizeHandle';

interface IProject {
  id: string;
  name: string;
  description: string;
}

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

interface IMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  created_at: string;
}

interface IMemo {
  id: string;
  anchor_text: string;
  question: string;
  is_resolved: boolean;
}

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<IProject | null>(null);
  const [items, setItems] = useState<IItemTree[]>([]);
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [memos, setMemos] = useState<IMemo[]>([]);
  const [structuring, setStructuring] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorPercent, setEditorPercent] = useState(60);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadProject = async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        router.push('/');
        return;
      }
      setProject(await res.json());
    };

    const loadItems = async () => {
      const res = await fetch(`/api/projects/${id}/items`);
      if (res.ok) {
        setItems(await res.json());
      }
    };

    const loadConversations = async () => {
      const res = await fetch(`/api/projects/${id}/conversations`);
      if (res.ok) {
        setMessages(await res.json());
      }
    };

    const loadMemos = async () => {
      const res = await fetch(`/api/projects/${id}/memos?unresolved=true`);
      if (res.ok) {
        setMemos(await res.json());
      }
    };

    loadProject();
    loadItems();
    loadConversations();
    loadMemos();
  }, [id, router]);

  const handleStructure = useCallback(async (_content: string) => {
    setStructuring(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${id}/structure`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        if (data.message) {
          setMessages(prev => [...prev, data.message]);
        }
        if (data.memos) {
          setMemos(data.memos);
        }
      } else {
        const data = await res.json();
        setError(data.error || '구조화에 실패했습니다');
      }
    } catch {
      setError('AI 연결에 실패했습니다');
    } finally {
      setStructuring(false);
    }
  }, [id]);

  const handleItemUpdate = useCallback(async (itemId: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/projects/${id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        // Reload items tree to reflect changes (including cascaded lock)
        const itemsRes = await fetch(`/api/projects/${id}/items`);
        if (itemsRes.ok) {
          setItems(await itemsRes.json());
        }
      }
    } catch {
      setError('항목 업데이트에 실패했습니다');
    }
  }, [id]);

  const handleSendMessage = useCallback(async (message: string) => {
    setChatLoading(true);
    setError(null);

    // Optimistically add user message
    const tempUserMsg: IMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/projects/${id}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        // Replace the temp message with real messages
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id);
          return [...withoutTemp, ...data.messages];
        });
        if (data.memos) {
          setMemos(data.memos);
        }
      } else {
        const data = await res.json();
        setError(data.error || '응답에 실패했습니다');
        // Remove temp message on error
        setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      }
    } catch {
      setError('AI 연결에 실패했습니다');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setChatLoading(false);
    }
  }, [id]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm px-2 py-1 rounded-md"
          >
            &larr; 뒤로
          </button>
          <span className="text-border">|</span>
          <h1 className="text-sm font-semibold">{project.name}</h1>
          {project.description && (
            <span className="text-xs text-muted-foreground">{project.description}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-destructive">{error}</span>
          )}
          <button
            onClick={() => handleStructure('')}
            disabled={structuring}
            className="px-3 py-1.5 text-xs bg-accent hover:bg-accent/80 text-white
                       rounded-md transition-colors disabled:opacity-50"
          >
            {structuring ? '구조화 중...' : '지금 구조화'}
          </button>
        </div>
      </header>

      {/* 2-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Editor (top) + Chat (bottom) */}
        <div ref={leftPanelRef} className="w-1/2 border-r border-border flex flex-col">
          <div style={{ height: `${editorPercent}%` }} className="flex flex-col min-h-0">
            <Editor projectId={id} onContentChange={handleStructure} memos={memos} />
          </div>
          <ResizeHandle onResize={setEditorPercent} containerRef={leftPanelRef} />
          <div style={{ height: `${100 - editorPercent}%` }} className="flex flex-col min-h-0">
            <ChatPanel
              messages={messages}
              loading={chatLoading || structuring}
              onSendMessage={handleSendMessage}
            />
          </div>
        </div>

        {/* Right: Tree View */}
        <div className="w-1/2 flex flex-col">
          <TreeView items={items} loading={structuring} projectId={id} onItemUpdate={handleItemUpdate} />
        </div>
      </div>
    </div>
  );
}
