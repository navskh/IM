'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ITask, TaskStatus, ItemPriority } from '@/types';
import StatusFlow from './StatusFlow';
import PromptEditor from './PromptEditor';
import TaskChat from './TaskChat';

export default function TaskDetail({
  task,
  projectId,
  subProjectId,
  onUpdate,
  onDelete,
}: {
  task: ITask;
  projectId: string;
  subProjectId: string;
  onUpdate: (data: Partial<ITask>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [promptContent, setPromptContent] = useState('');
  const [refining, setRefining] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  const basePath = `/api/projects/${projectId}/sub-projects/${subProjectId}/tasks/${task.id}`;
  const overlayRef = useRef<HTMLDivElement>(null);

  // Load prompt
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    fetch(`${basePath}/prompt`)
      .then(r => r.json())
      .then(data => setPromptContent(data.content || ''));
  }, [task.id, task.title, task.description, basePath]);

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

  const savePrompt = useCallback(async (content: string) => {
    setPromptContent(content);
    await fetch(`${basePath}/prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, prompt_type: 'manual' }),
    });
  }, [basePath]);

  const handleRefine = useCallback(async () => {
    setRefining(true);
    try {
      const res = await fetch(`${basePath}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Please refine and improve this prompt for a coding assistant. Current prompt: ${promptContent || '(empty - generate one based on the task)'}. Task: ${task.title}. Description: ${task.description}. Output ONLY the improved prompt text, nothing else.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const refined = data.aiMessage?.content || '';
        if (refined) {
          await savePrompt(refined);
        }
      }
    } catch { /* silent */ }
    setRefining(false);
  }, [basePath, promptContent, task.title, task.description, savePrompt]);

  const handleApplyToPrompt = useCallback(async (content: string) => {
    await savePrompt(content);
  }, [savePrompt]);

  const priorities: ItemPriority[] = ['high', 'medium', 'low'];

  return (
    <div className="flex flex-col h-full">
      {/* Compact header: Title + Status + Actions */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0 space-y-2">
        {/* Title */}
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

        {/* Status + Priority + Today + Prompt + Delete */}
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
            onClick={() => setShowPromptModal(true)}
            className={`text-xs px-2 py-0.5 rounded transition-colors border ${
              promptContent
                ? 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25'
                : 'text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            Prompt{promptContent ? ' *' : ''}
          </button>

          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
          >
            Delete
          </button>
        </div>

        {/* Description - compact */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          placeholder="Background, conditions, notes..."
          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm
                     focus:border-primary focus:outline-none text-foreground resize-none
                     leading-relaxed"
          rows={2}
        />
      </div>

      {/* AI Chat - takes remaining space */}
      <div className="flex-1 min-h-0">
        <TaskChat
          basePath={basePath}
          taskStatus={task.status}
          onApplyToPrompt={handleApplyToPrompt}
        />
      </div>

      {/* Prompt Modal */}
      {showPromptModal && (
        <div
          ref={overlayRef}
          onClick={(e) => { if (e.target === overlayRef.current) setShowPromptModal(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        >
          <div className="bg-card border border-border rounded-xl shadow-2xl shadow-black/40
                          w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col animate-dialog-in">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Prompt</h3>
              <button
                onClick={() => setShowPromptModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <PromptEditor
                content={promptContent}
                onSave={savePrompt}
                onRefine={handleRefine}
                refining={refining}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
