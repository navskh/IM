import { exec } from 'node:child_process';
import { getDb } from './db';
import { ensureDb } from './db';

let initialized = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastNotifiedDate = '';

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sendNotification(title: string, message: string) {
  // macOS native notification via osascript. Other platforms get a console log.
  if (process.platform !== 'darwin') {
    console.log(`[${title}] ${message}`);
    return;
  }
  const escaped = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const script = `display notification "${escaped}" with title "${title}"`;
  exec(`osascript -e '${script}'`, (err) => {
    if (err) console.error('[Scheduler] notification error:', err.message);
  });
}

async function checkMorningNotification() {
  const now = new Date();
  const hour = now.getHours();
  const today = formatDate(now);

  // Send between 9:00-9:05, once per day
  if (hour !== 9 || lastNotifiedDate === today) return;

  try {
    await ensureDb();
    const db = getDb();

    // Today tasks
    const todayTasks = db.prepare(
      "SELECT t.title, t.status, p.name as project_name FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.is_today = 1 AND t.status != 'done'"
    ).all() as { title: string; status: string; project_name: string }[];

    // Active tasks (submitted/testing)
    const activeTasks = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE status IN ('submitted', 'testing')"
    ).get() as { count: number };

    // Problem tasks
    const problemTasks = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE status = 'problem'"
    ).get() as { count: number };

    const lines: string[] = [];

    if (todayTasks.length > 0) {
      lines.push(`Today: ${todayTasks.length}개`);
      for (const t of todayTasks.slice(0, 5)) {
        lines.push(`  - ${t.title}`);
      }
      if (todayTasks.length > 5) lines.push(`  ... +${todayTasks.length - 5}개`);
    } else {
      lines.push('Today 태스크가 없습니다.');
    }

    if (activeTasks.count > 0) lines.push(`진행 중: ${activeTasks.count}개`);
    if (problemTasks.count > 0) lines.push(`문제: ${problemTasks.count}개`);

    sendNotification('IM - 오늘의 할 일', lines.join('\n'));
    lastNotifiedDate = today;
  } catch (err) {
    console.error('[Scheduler] error:', err);
  }
}

export function initScheduler() {
  if (initialized) return;
  initialized = true;

  // Check every minute. unref() so it doesn't pin the event loop for MCP stdio mode.
  timer = setInterval(checkMorningNotification, 60 * 1000);
  timer.unref?.();

  // Also check immediately on startup
  checkMorningNotification();

  console.log('[Scheduler] Morning notification scheduler started');
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  initialized = false;
}
