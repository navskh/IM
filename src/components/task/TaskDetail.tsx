'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ITask, TaskStatus, ItemPriority } from '@/types';
import StatusFlow from './StatusFlow';
import TaskChat from './TaskChat';
import NoteEditor from './NoteEditor';
import CommandPalette, { type RefineCommand } from './CommandPalette';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';

export default function TaskDetail({
  task,
  projectId,
  subProjectId,
  siblingTasks,
  onUpdate,
  onDelete,
  onChatStateChange,
}: {
  task: ITask;
  projectId: string;
  subProjectId: string;
  /** Other tasks under the same sub-project — used to widen autocomplete corpus. */
  siblingTasks?: ITask[];
  onUpdate: (data: Partial<ITask>) => void;
  onDelete: () => void;
  onChatStateChange?: (taskId: string, state: 'idle' | 'loading' | 'done') => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [editingTitle, setEditingTitle] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineElapsed, setRefineElapsed] = useState(0);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<{ taskId: string; doc: string } | null>(null);
  const refineAbortRef = useRef<AbortController | null>(null);

  const basePath = `/api/projects/${projectId}/sub-projects/${subProjectId}/tasks/${task.id}`;
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [brainstormText, setBrainstormText] = useState('');

  // Fetch the project's brainstorm once per project — used as autocomplete corpus.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/brainstorm`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        setBrainstormText(typeof data?.content === 'string' ? data.content : '');
      })
      .catch(() => { /* silent — corpus is non-critical */ });
    return () => { cancelled = true; };
  }, [projectId]);

  const extraCorpus = useMemo<string[]>(() => {
    const parts: string[] = [];
    if (siblingTasks) {
      for (const t of siblingTasks) {
        if (t.id === task.id) continue;
        if (t.title) parts.push(t.title);
        if (t.description) parts.push(t.description);
      }
    }
    if (brainstormText) parts.push(brainstormText);
    return parts;
  }, [siblingTasks, brainstormText, task.id]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
  }, [task.id, task.title, task.description]);

  const saveTitle = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate({ title: trimmed });
    } else {
      setTitle(task.title);
    }
    setEditingTitle(false);
  }, [title, task.title, onUpdate]);

  const saveDescription = useCallback(() => {
    if (description !== task.description) {
      onUpdate({ description });
    }
  }, [description, task.description, onUpdate]);

  const insertIntoNote = useCallback((content: string) => {
    const next = description
      ? `${description.trimEnd()}\n\n${content.trim()}\n`
      : `${content.trim()}\n`;
    setDescription(next);
    onUpdate({ description: next });
  }, [description, onUpdate]);

  const copyAsPrompt = useCallback(async () => {
    const body = description?.trim() || '(비어있음)';
    const text = `# ${task.title}\n\n${body}\n`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* silent */ }
  }, [task.title, description]);

  // Command palette — captures selection from CM view and replaces/inserts
  const openPalette = useCallback(() => {
    const view = editorRef.current?.view;
    if (view) {
      const sel = view.state.selection.main;
      setHasSelection(!sel.empty);
    }
    setPaletteOpen(true);
  }, []);

  const runRefine = useCallback(async (cmd: RefineCommand, customText?: string) => {
    const view = editorRef.current?.view;
    if (!view) { setPaletteOpen(false); return; }

    const launchTaskId = task.id;
    const sel = view.state.selection.main;
    const selFrom = sel.from;
    const selTo = sel.to;
    const selectionText = sel.empty ? '' : view.state.sliceDoc(selFrom, selTo);
    const snapshotDoc = view.state.doc.toString();
    setPaletteOpen(false);
    setRefineError(null);
    setUndoSnapshot(null);
    setRefining(true);
    setRefineElapsed(0);
    const abort = new AbortController();
    refineAbortRef.current = abort;
    const started = Date.now();
    const tick = setInterval(() => setRefineElapsed(Math.floor((Date.now() - started) / 1000)), 500);

    try {
      const res = await fetch(`${basePath}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          customText,
          selection: selectionText || undefined,
          note: snapshotDoc,
        }),
        signal: abort.signal,
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const output = (data.result || '').trim();
      if (!output) {
        throw new Error('AI 응답이 비어있습니다');
      }

      // If user switched to another task during the await, don't clobber it.
      if (launchTaskId !== task.id) {
        setRefineError('다른 태스크로 이동하여 결과를 버렸습니다');
        setTimeout(() => setRefineError(null), 4000);
        return;
      }

      // Build next doc via string splicing — independent of CM view lifecycle.
      // CM view may have been recreated during the await; positions from the
      // captured selection are still valid against the snapshot doc.
      const safeFrom = Math.min(selFrom, snapshotDoc.length);
      const safeTo = Math.min(selTo, snapshotDoc.length);
      let nextDoc: string;
      let nextCaret: number;
      if (selFrom === selTo) {
        // empty selection → insert at caret with blank-line padding when not at start
        const prefix = safeFrom > 0 ? '\n\n' : '';
        const insert = prefix + output + '\n';
        nextDoc = snapshotDoc.slice(0, safeFrom) + insert + snapshotDoc.slice(safeFrom);
        nextCaret = safeFrom + insert.length;
      } else {
        nextDoc = snapshotDoc.slice(0, safeFrom) + output + snapshotDoc.slice(safeTo);
        nextCaret = safeFrom + output.length;
      }

      // Update React state first — triggers CM re-sync via value prop
      setDescription(nextDoc);
      onUpdate({ description: nextDoc });

      // Remember the pre-refine doc so the user can undo a bad suggestion.
      // 30s is enough to read the output and decide.
      setUndoSnapshot({ taskId: launchTaskId, doc: snapshotDoc });
      setTimeout(() => {
        setUndoSnapshot(prev => (prev && prev.taskId === launchTaskId ? null : prev));
      }, 30000);

      // Best-effort: move caret inside the live view if still mounted
      const liveView = editorRef.current?.view;
      if (liveView) {
        try {
          const clamped = Math.min(nextCaret, liveView.state.doc.length);
          liveView.dispatch({ selection: { anchor: clamped } });
        } catch { /* selection restore is non-critical */ }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        // User cancelled — no error message needed.
      } else {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        setRefineError(msg);
        setTimeout(() => setRefineError(null), 6000);
      }
    } finally {
      clearInterval(tick);
      setRefining(false);
      refineAbortRef.current = null;
    }
  }, [basePath, onUpdate, task.id]);

  const cancelRefine = useCallback(() => {
    refineAbortRef.current?.abort();
  }, []);

  const undoRefine = useCallback(() => {
    if (!undoSnapshot) return;
    if (undoSnapshot.taskId !== task.id) { setUndoSnapshot(null); return; }
    setDescription(undoSnapshot.doc);
    onUpdate({ description: undoSnapshot.doc });
    setUndoSnapshot(null);
  }, [undoSnapshot, task.id, onUpdate]);

  const priorities: ItemPriority[] = ['high', 'medium', 'low'];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0 space-y-2">
        {editingTitle ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(task.title); setEditingTitle(false); } }}
            className="w-full bg-transparent text-lg font-semibold border-b border-primary
                       focus:outline-none pb-1 text-foreground"
            autoFocus
          />
        ) : (
          <h2
            onClick={() => setEditingTitle(true)}
            className="text-lg font-semibold cursor-text hover:text-primary transition-colors"
          >
            {task.title}
          </h2>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <StatusFlow status={task.status} onChange={(status: TaskStatus) => onUpdate({ status })} />
          <div className="flex items-center gap-1">
            {priorities.map(p => (
              <button
                key={p}
                onClick={() => onUpdate({ priority: p })}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  task.priority === p
                    ? p === 'high' ? 'bg-destructive/20 text-destructive' : p === 'medium' ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => onUpdate({ is_today: !task.is_today })}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              task.is_today
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {task.is_today ? 'Today *' : 'Mark today'}
          </button>

          <span className="text-border">|</span>

          <button
            onClick={openPalette}
            title="AI 명령 (⌘K)"
            className="text-xs px-2 py-0.5 rounded transition-colors border border-border
                       text-muted-foreground hover:text-foreground hover:border-muted-foreground"
          >
            ⌘K
          </button>
          <button
            onClick={copyAsPrompt}
            title="노트를 Claude Code용으로 클립보드에 복사"
            className="text-xs px-2 py-0.5 rounded transition-colors border border-border
                       text-muted-foreground hover:text-foreground hover:border-muted-foreground"
          >
            {copied ? '✓ Copied' : 'Copy as Prompt'}
          </button>
          <button
            onClick={() => setChatOpen(v => !v)}
            className={`text-xs px-2 py-0.5 rounded transition-colors border ${
              chatOpen
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            💬 Chat
          </button>

          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Note editor */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        <div className="px-4 pt-2 pb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Note</span>
          <span className="text-[10px] text-muted-foreground/60">
            Tab 제안 수락 · ⌘K AI 명령 · 자동 저장
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <NoteEditor
            ref={editorRef}
            value={description}
            onChange={setDescription}
            onBlur={saveDescription}
            onOpenCommand={openPalette}
            extraCorpus={extraCorpus}
            placeholder="자유롭게 작성하세요. 배경 · 목표 · 관련 파일 · 결정사항 · 질문 · 링크 등 뭐든..."
          />
        </div>
        {refining && (
          <div className="absolute bottom-2 right-3 text-xs px-2 py-1 rounded bg-muted/90 text-foreground flex items-center gap-2 shadow-lg border border-border">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
            <span>AI 작업 중 {refineElapsed}s (최대 90s)</span>
            <button
              onClick={cancelRefine}
              className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
              title="취소"
            >
              취소
            </button>
          </div>
        )}
        {!refining && undoSnapshot && undoSnapshot.taskId === task.id && (
          <div className="absolute bottom-2 right-3 text-xs px-2 py-1 rounded bg-accent/15 text-foreground flex items-center gap-2 shadow-lg border border-accent/30">
            <span className="text-accent">✓</span>
            <span>AI 결과 적용됨</span>
            <button
              onClick={undoRefine}
              className="px-1.5 py-0.5 rounded bg-background/60 hover:bg-background text-foreground transition-colors"
              title="되돌리기 (30초 내)"
            >
              ↶ 되돌리기
            </button>
            <button
              onClick={() => setUndoSnapshot(null)}
              className="text-muted-foreground hover:text-foreground"
              title="닫기"
            >
              ×
            </button>
          </div>
        )}
        {refineError && (
          <div className="absolute bottom-2 right-3 text-xs px-3 py-2 rounded bg-destructive/15 text-destructive flex items-center gap-2 shadow-lg border border-destructive/40 max-w-[70%]">
            <span>⚠</span>
            <span className="truncate">AI 실패: {refineError}</span>
            <button onClick={() => setRefineError(null)} className="text-destructive/60 hover:text-destructive">×</button>
          </div>
        )}
      </div>

      {/* Chat (optional, collapsed by default) */}
      {chatOpen && (
        <div className="h-[38%] min-h-[240px] border-t border-border">
          <TaskChat
            basePath={basePath}
            taskStatus={task.status}
            onInsertToNote={insertIntoNote}
            onChatStateChange={onChatStateChange ? (state) => onChatStateChange(task.id, state) : undefined}
          />
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        hasSelection={hasSelection}
        onClose={() => setPaletteOpen(false)}
        onRun={runRefine}
      />
    </div>
  );
}
