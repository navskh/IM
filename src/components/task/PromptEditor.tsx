'use client';

import { useState, useRef, useEffect } from 'react';

export default function PromptEditor({
  content,
  onSave,
  onRefine,
  refining,
}: {
  content: string;
  onSave: (content: string) => void;
  onRefine?: () => void;
  refining?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(content);
  }, [content]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prompt</h4>
        <div className="flex items-center gap-1.5">
          {onRefine && (
            <button
              onClick={onRefine}
              disabled={refining}
              className="prompt-action-btn prompt-generate-btn"
            >
              {refining ? 'Refining...' : 'AI Refine'}
            </button>
          )}
          {!editing && content && (
            <button onClick={handleCopy} className="prompt-action-btn">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
          {!editing ? (
            <button onClick={() => setEditing(true)} className="prompt-action-btn">
              Edit
            </button>
          ) : (
            <>
              <button onClick={() => { setDraft(content); setEditing(false); }} className="prompt-action-btn">
                Cancel
              </button>
              <button onClick={handleSave} className="prompt-action-btn" style={{ color: 'hsl(var(--success))' }}>
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setDraft(content); setEditing(false); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
          }}
          className="prompt-edit-textarea"
          rows={4}
          placeholder="Write your prompt here..."
        />
      ) : content ? (
        <div className="prompt-content text-sm">{content}</div>
      ) : (
        <div className="text-sm text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
          No prompt yet. Click Edit to write one.
        </div>
      )}
    </div>
  );
}
