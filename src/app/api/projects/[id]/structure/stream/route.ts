import { NextRequest } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { getProjectContextSummary } from '@/lib/db/queries/context';
import { structureWithChatDirect } from '@/lib/ai/structurer';
import {
  getTask, startTask, addTaskEvent, finishTask, failTask,
  addTaskListener, cleanupTasks,
} from '@/lib/task-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return new Response('Project not found', { status: 404 });
  }

  cleanupTasks();

  const existingTask = getTask(id);

  // If there's an active task, attach to it (reconnect scenario)
  if (existingTask && existingTask.status === 'running') {
    return createReconnectStream(id, existingTask);
  }

  // If recently finished task exists, replay final result
  if (existingTask && existingTask.status === 'done' && existingTask.result) {
    return createReplayStream(existingTask);
  }

  // Start new task
  const brainstorm = getBrainstorm(id);
  if (!brainstorm) {
    return new Response('Project not initialized', { status: 400 });
  }

  const hasContent = brainstorm.content.trim();
  const hasContext = !!getProjectContextSummary(id);

  if (!hasContent && !hasContext) {
    return new Response('No content to structure', { status: 400 });
  }

  // User-provided project description from scan panel
  const userDescription = request.nextUrl.searchParams.get('desc') || '';

  let content = hasContent
    ? brainstorm.content
    : '프로젝트 스캔 결과를 분석하여 현재 프로젝트의 구조, 진행 상황, TODO 항목을 파악해주세요.';

  if (userDescription) {
    content = `[사용자가 제공한 프로젝트 설명]\n${userDescription}\n\n${content}`;
  }

  const brainstormId = brainstorm.id;

  // Start background task
  startTask(id);

  const send = async (event: string, data: unknown) => {
    addTaskEvent(id, event, data);
    if (event === 'done') {
      finishTask(id, data);
    }
  };

  // Run structuring in background (detached from stream)
  (async () => {
    try {
      await structureWithChatDirect(id, brainstormId, content, send);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Structure failed';
      addTaskEvent(id, 'error', { error: msg });
      failTask(id, msg);
    }
  })();

  // Stream events to this client
  return createReconnectStream(id, getTask(id)!);
}

function createReconnectStream(projectId: string, task: ReturnType<typeof getTask>) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller may be closed
        }
      };

      // Replay past events
      if (task) {
        for (const ev of task.events) {
          send(ev.event, ev.data);
        }

        // If already finished, close immediately
        if (task.status !== 'running') {
          controller.close();
          return;
        }
      }

      // Listen for new events
      unsubscribe = addTaskListener(projectId, (event, data) => {
        send(event, data);
        if (event === 'done' || event === 'error') {
          try { controller.close(); } catch { /* already closed */ }
          unsubscribe?.();
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function createReplayStream(task: NonNullable<ReturnType<typeof getTask>>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const ev of task.events) {
        try {
          controller.enqueue(encoder.encode(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`));
        } catch { break; }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
