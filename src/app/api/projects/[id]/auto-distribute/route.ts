import { NextRequest, NextResponse } from 'next/server';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { getSubProjectsWithStats } from '@/lib/db/queries/sub-projects';
import { getProject } from '@/lib/db/queries/projects';
import { runAgent } from '@/lib/ai/client';
import { ensureDb } from '@/lib/db';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureDb();
  const { id } = await params;

  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const brainstorm = getBrainstorm(id);
  if (!brainstorm?.content?.trim()) {
    return NextResponse.json({ error: 'No brainstorming content' }, { status: 400 });
  }

  const subProjects = getSubProjectsWithStats(id);

  const existingInfo = subProjects.length > 0
    ? `\n\nExisting sub-projects:\n${subProjects.map(sp => {
        const taskList = sp.preview_tasks.length > 0
          ? sp.preview_tasks.map(t => `    - ${t.title} (${t.status})`).join('\n')
          : '    (no tasks)';
        return `  - "${sp.name}" (${sp.task_count} tasks)\n${taskList}`;
      }).join('\n')}`
    : '';

  const prompt = `You are a task distribution assistant. Analyze the brainstorming content below and distribute it into sub-projects and tasks.

Rules:
- Respond ONLY with a valid JSON object, no markdown, no explanation.
- Use existing sub-projects when the content fits. Create new ones only when needed.
- Each task should be a concrete, actionable item.
- Task titles should be concise (under 60 chars).
- Priority: "high", "medium", or "low".
- Respond in the same language as the brainstorming content.

Brainstorming content:
${brainstorm.content.slice(0, 5000)}
${existingInfo}

Respond with this exact JSON structure:
{
  "distributions": [
    {
      "sub_project_name": "Name of sub-project",
      "is_new": false,
      "existing_sub_id": "id-if-existing-or-null",
      "tasks": [
        { "title": "Task title", "description": "Brief description", "priority": "medium" }
      ]
    }
  ]
}`;

  try {
    const agentType = project.agent_type || 'claude';
    const aiResponse = await runAgent(agentType, prompt);

    // Strip markdown fences and find JSON
    let cleaned = aiResponse.trim();
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '').replace(/\n?```/g, '');
    cleaned = cleaned.trim();

    // Try to find the distributions JSON object
    const jsonMatch = cleaned.match(/\{\s*"distributions"\s*:\s*\[[\s\S]*\]\s*\}/);
    // Fallback: any JSON object
    const fallbackMatch = !jsonMatch ? cleaned.match(/\{[\s\S]*\}/) : null;
    const matchStr = jsonMatch?.[0] || fallbackMatch?.[0];

    if (!matchStr) {
      return NextResponse.json({ error: 'AI did not return valid JSON', raw: cleaned.slice(0, 500) }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(matchStr);
    } catch {
      return NextResponse.json({ error: 'JSON parse failed', raw: matchStr.slice(0, 500) }, { status: 500 });
    }

    if (!parsed.distributions || !Array.isArray(parsed.distributions)) {
      return NextResponse.json({ error: 'Invalid distribution format', raw: matchStr.slice(0, 500) }, { status: 500 });
    }

    // Map existing sub-project IDs
    for (const dist of parsed.distributions) {
      if (!dist.is_new && !dist.existing_sub_id) {
        const match = subProjects.find(sp =>
          sp.name.toLowerCase() === dist.sub_project_name.toLowerCase()
        );
        if (match) {
          dist.existing_sub_id = match.id;
          dist.is_new = false;
        } else {
          dist.is_new = true;
        }
      }
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `AI call failed: ${message}` }, { status: 500 });
  }
}
