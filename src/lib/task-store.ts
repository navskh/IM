/**
 * In-memory background task store for structuring jobs.
 * Survives page refreshes (server-side singleton).
 * Tasks are per-project — only one active task per project.
 */

export interface TaskEvent {
  event: string;
  data: unknown;
  timestamp: number;
}

export interface BackgroundTask {
  projectId: string;
  status: 'running' | 'done' | 'error';
  events: TaskEvent[];       // full event log (for replay on reconnect)
  startedAt: number;
  finishedAt?: number;
  result?: unknown;          // final 'done' event data
  error?: string;
}

const tasks = new Map<string, BackgroundTask>();

export function getTask(projectId: string): BackgroundTask | undefined {
  return tasks.get(projectId);
}

export function startTask(projectId: string): BackgroundTask {
  const task: BackgroundTask = {
    projectId,
    status: 'running',
    events: [],
    startedAt: Date.now(),
  };
  tasks.set(projectId, task);
  return task;
}

export function addTaskEvent(projectId: string, event: string, data: unknown) {
  const task = tasks.get(projectId);
  if (!task) return;
  task.events.push({ event, data, timestamp: Date.now() });

  // Notify all listeners
  const listeners = taskListeners.get(projectId);
  if (listeners) {
    for (const listener of listeners) {
      listener(event, data);
    }
  }
}

export function finishTask(projectId: string, result?: unknown) {
  const task = tasks.get(projectId);
  if (!task) return;
  task.status = 'done';
  task.finishedAt = Date.now();
  task.result = result;
}

export function failTask(projectId: string, error: string) {
  const task = tasks.get(projectId);
  if (!task) return;
  task.status = 'error';
  task.finishedAt = Date.now();
  task.error = error;
}

// Clean up old finished tasks (older than 5 minutes)
export function cleanupTasks() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (task.status !== 'running' && task.finishedAt && now - task.finishedAt > 5 * 60 * 1000) {
      tasks.delete(id);
      taskListeners.delete(id);
    }
  }
}

// --- Listener system for SSE streaming ---
type TaskListener = (event: string, data: unknown) => void;
const taskListeners = new Map<string, Set<TaskListener>>();

export function addTaskListener(projectId: string, listener: TaskListener): () => void {
  if (!taskListeners.has(projectId)) taskListeners.set(projectId, new Set());
  taskListeners.get(projectId)!.add(listener);

  // Return unsubscribe function
  return () => {
    const listeners = taskListeners.get(projectId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) taskListeners.delete(projectId);
    }
  };
}
