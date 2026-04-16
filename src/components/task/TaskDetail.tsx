'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ITask, TaskStatus, ItemPriority } from '@/types';
import StatusFlow from './StatusFlow';
import TaskChat from './TaskChat';
import NoteEditor, { getPromotableLine } from './NoteEditor';
import CommandPalette, { type RefineCommand } from './CommandPalette';
import { registerAiActivity, unregisterAiActivity } from '@/lib/ai-activity';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';

export default function TaskDetail({
  task,
  projectId,
  subProjectId,
  siblingTasks,
  onUpdate,
  onDelete,
  onTaskPromoted,
  onTaskMoved,
  onChatStateChange,
}: {
  task: ITask;
  projectId: string;
  subProjectId: string;
  /** Other tasks under the same sub-project — used to widen autocomplete corpus. */
  siblingTasks?: ITask[];
  onUpdate: (data: Partial<ITask>) => void;
  onDelete: () => void;
  /** Fired after a checkbox line is promoted to a new task. Parent should refresh its task list. */
  onTaskPromoted?: (newTask: ITask) => void;
  /** Fired after task is moved to another sub-project. Parent should refresh. */
  onTaskMoved?: () => void;
  onChatStateChange?: (taskId: string, state: 'idle' | 'loading' | 'done') => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [editingTitle, setEditingTitle] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const chatWasManuallyToggled = useRef(false);

  // Auto-open the chat panel while the task is being executed by the watcher —
  // that's where streaming progress shows up. Don't override a manual toggle
  // the user made in this session.
  useEffect(() => {
    if (task.status === 'testing' && !chatOpen && !chatWasManuallyToggled.current) {
      setChatOpen(true);
    }
  }, [task.status, chatOpen]);
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
    const actId = `refine-${Date.now()}`;
    registerAiActivity({ id: actId, type: 'refine', label: `Refine: ${task.title}`, startedAt: Date.now() });
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
      unregisterAiActivity(actId);
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

  const [promoteNotice, setPromoteNotice] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveProjects, setMoveProjects] = useState<{ id: string; name: string; subs: { id: string; name: string }[] }[]>([]);
  const [moveTargetSub, setMoveTargetSub] = useState('');
  const [moving, setMoving] = useState(false);

  const openMoveModal = useCallback(async () => {
    try {
      const pRes = await fetch('/api/projects');
      const projects = await pRes.json() as { id: string; name: string }[];
      const withSubs = await Promise.all(projects.map(async (p) => {
        const sRes = await fetch(`/api/projects/${p.id}/sub-projects`);
        const subs = await sRes.json() as { id: string; name: string }[];
        return { ...p, subs };
      }));
      setMoveProjects(withSubs);
      setMoveTargetSub('');
      setShowMoveModal(true);
    } catch { /* silent */ }
  }, []);

  const doMove = useCallback(async () => {
    if (!moveTargetSub || moving) return;
    setMoving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subProjectId: moveTargetSub }),
      });
      if (res.ok) {
        setShowMoveModal(false);
        onTaskMoved?.();
      }
    } catch { /* silent */ }
    setMoving(false);
  }, [moveTargetSub, moving, task.id, onTaskMoved]);

  const promoteCheckbox = useCallback(async () => {
    const view = editorRef.current?.view;
    if (!view) return;
    const line = getPromotableLine(view);
    if (!line) {
      setRefineError('체크박스나 불릿 목록 줄에 커서를 두고 실행하세요');
      setTimeout(() => setRefineError(null), 3000);
      return;
    }
    const titleText = line.content.slice(0, 200);
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-projects/${subProjectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const newTask = await res.json() as ITask;

      // Remove the promoted line from the note (and a trailing newline, if any).
      const doc = view.state.doc.toString();
      const before = doc.slice(0, line.from);
      const afterRaw = doc.slice(line.to);
      const trimmed = afterRaw.startsWith('\n') ? afterRaw.slice(1) : afterRaw;
      const nextDoc = before + trimmed;
      setDescription(nextDoc);
      onUpdate({ description: nextDoc });
      onTaskPromoted?.(newTask);

      setPromoteNotice(`→ 태스크 "${titleText}" 생성됨`);
      setTimeout(() => setPromoteNotice(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '태스크 생성 실패';
      setRefineError(msg);
      setTimeout(() => setRefineError(null), 4000);
    }
  }, [projectId, subProjectId, onUpdate, onTaskPromoted]);

  const priorities: ItemPriority[] = ['high', 'medium', 'low'];

  // Focus mode: Esc to exit (when not in slash autocomplete or other modal)
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFocusMode(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  if (focusMode) {
    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{task.title}</h2>
            <span className="text-xs text-muted-foreground">Focus Mode</span>
          </div>
          <button
            onClick={() => setFocusMode(false)}
            className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Esc 닫기
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <NoteEditor
            ref={editorRef}
            value={description}
            onChange={setDescription}
            onBlur={saveDescription}
            onOpenCommand={openPalette}
            onPromoteLine={promoteCheckbox}
            extraCorpus={extraCorpus}
            placeholder="집중 모드 — 자유롭게 작성하세요…"
          />
        </div>
        <CommandPalette open={paletteOpen} hasSelection={hasSelection} onClose={() => setPaletteOpen(false)} onRun={runRefine} />
      </div>
    );
  }

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
            onClick={() => setFocusMode(true)}
            title="포커스 모드 — 노트만 풀스크린"
            className="text-xs px-2 py-0.5 rounded transition-colors border border-border
                       text-muted-foreground hover:text-foreground hover:border-muted-foreground"
          >
            Focus
          </button>
          <button
            onClick={() => { chatWasManuallyToggled.current = true; setChatOpen(v => !v); }}
            className={`text-xs px-2 py-0.5 rounded transition-colors border ${
              chatOpen
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            💬 Chat
          </button>

          <button
            onClick={openMoveModal}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            Move
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Delete
          </button>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(task.tags ?? []).map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
              {tag}
              <button
                onClick={() => onUpdate({ tags: task.tags.filter(t => t !== tag) })}
                className="text-muted-foreground/60 hover:text-destructive text-[10px] leading-none"
              >×</button>
            </span>
          ))}
          {showTagInput ? (
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const t = tagInput.trim();
                  if (t && !(task.tags ?? []).includes(t)) {
                    onUpdate({ tags: [...(task.tags ?? []), t] });
                  }
                  setTagInput('');
                }
                if (e.key === 'Escape') { setTagInput(''); setShowTagInput(false); }
              }}
              onBlur={() => { setTagInput(''); setShowTagInput(false); }}
              placeholder="태그 입력…"
              className="text-xs bg-transparent border-b border-border focus:border-primary focus:outline-none px-1 py-0.5 w-24"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              + tag
            </button>
          )}
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
            onPromoteLine={promoteCheckbox}
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
        {promoteNotice && (
          <div className="absolute bottom-2 right-3 text-xs px-3 py-1.5 rounded bg-success/15 text-success flex items-center gap-2 shadow-lg border border-success/30">
            <span>✓</span>
            <span className="truncate max-w-[50ch]">{promoteNotice}</span>
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

      {showMoveModal && (
        <div
          onClick={() => setShowMoveModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-4 flex flex-col gap-3 animate-dialog-in">
            <div className="text-sm font-semibold text-foreground">태스크 이동</div>
            <div className="text-xs text-muted-foreground">"{task.title}" 을 다른 프로젝트로 이동합니다.</div>
            <select
              value={moveTargetSub}
              onChange={(e) => setMoveTargetSub(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">이동할 대상 선택…</option>
              {moveProjects.map(p => (
                <optgroup key={p.id} label={p.name}>
                  {p.subs.map(s => (
                    <option key={s.id} value={s.id} disabled={s.id === subProjectId}>
                      {s.name}{s.id === subProjectId ? ' (현재)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowMoveModal(false)} className="text-xs text-muted-foreground px-2 py-1">취소</button>
              <button
                onClick={doMove}
                disabled={!moveTargetSub || moving}
                className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-40"
              >
                {moving ? '이동 중…' : '이동'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
