import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { getPrompt, updatePromptContent } from '@/lib/db/queries/prompts';
import { generatePromptForItem } from '@/lib/ai/prompter';
import type { IItem } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { itemId } = await params;
  const prompt = getPrompt(itemId);

  if (!prompt) {
    return NextResponse.json({ error: 'No prompt found' }, { status: 404 });
  }

  return NextResponse.json(prompt);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: projectId, itemId } = await params;
  const db = getDb();

  const item = db.prepare('SELECT * FROM items WHERE id = ? AND project_id = ?')
    .get(itemId, projectId) as IItem | undefined;

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    // If manual content provided, save it directly
    if (body.content && typeof body.content === 'string') {
      const prompt = updatePromptContent(itemId, body.content);
      return NextResponse.json(prompt);
    }

    // Otherwise, generate with AI
    const prompt = await generatePromptForItem(item);
    return NextResponse.json(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prompt generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
