export interface AiActivity {
  id: string;
  type: 'refine' | 'task-chat' | 'project-advisor' | 'global-advisor' | 'watch';
  label: string;
  startedAt: number;
}

// Module-level store — survives React component unmounts.
let activities: AiActivity[] = [];
let listeners: Set<() => void> = new Set();

function notify() {
  for (const fn of listeners) fn();
}

export function registerAiActivity(activity: AiActivity) {
  activities = [...activities, activity];
  notify();
}

export function unregisterAiActivity(id: string) {
  activities = activities.filter(a => a.id !== id);
  notify();
}

export function getAiActivities(): AiActivity[] {
  return activities;
}

export function subscribeAiActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
