'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [showChat, setShowChat] = useState(false);

  const basePath = `/api/projects/${projectId}/sub-projects/${subProjectId}/tasks/${task.id}`;

  // Auto-show chat when task is being executed by watcher
  useEffect(() => {
    if (task.status === 'testing') setShowChat(true);
  }, [task.status]);

  // Load prompt
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setShowChat(task.status === 'testing');
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
      {/* Upper: Task info + Prompt */}
      <div className={`overflow-y-auto ${showChat ? 'flex-1 min-h-0' : 'flex-1'}`}>
        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            {editingTitle ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(task.title); setEditingTitle(false); } }}
                className="w-full bg-transparent text-xl font-semibold border-b border-primary
                           focus:outline-none pb-1 text-foreground"
                autoFocus
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="text-xl font-semibold cursor-text hover:text-primary transition-colors"
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Status + Priority + Today */}
          <div className="flex items-center gap-4 flex-wrap">
            <StatusFlow status={task.status} onChange={(status: TaskStatus) => onUpdate({ status })} />
            <div className="flex items-center gap-1">
              {priorities.map(p => (
                <button
                  key={p}
                  onClick={() => onUpdate({ priority: p })}
                  className={`px-2.5 py-1 text-sm rounded transition-colors ${
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
              className={`text-sm px-2.5 py-1 rounded transition-colors ${
                task.is_today
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {task.is_today ? 'Today *' : 'Mark today'}
            </button>
          </div>

          {/* Description */}
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="Background, conditions, notes..."
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm
                         focus:border-primary focus:outline-none text-foreground resize-y min-h-[60px]
                         leading-relaxed"
              rows={3}
            />
          </div>

          {/* Prompt */}
          <PromptEditor
            content={promptContent}
            onSave={savePrompt}
            onRefine={handleRefine}
            refining={refining}
          />

          {/* Actions */}
          <div className="pt-4 border-t border-border flex items-center justify-between">
            <button
              onClick={() => setShowChat(!showChat)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors border ${
                showChat
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'text-muted-foreground hover:text-foreground border-border hover:border-muted-foreground'
              }`}
            >
              {showChat ? 'Hide AI Chat' : 'AI Chat'}
            </button>
            <button
              onClick={onDelete}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Delete task
            </button>
          </div>
        </div>
      </div>

      {/* Lower: AI Chat */}
      {showChat && (
        <div className="h-[45%] flex-shrink-0">
          <TaskChat
            basePath={basePath}
            taskStatus={task.status}
            onApplyToPrompt={handleApplyToPrompt}
          />
        </div>
      )}
    </div>
  );
}
