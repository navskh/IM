import { spawn } from 'node:child_process';
import type { IStructureWithQuestions } from '@/types';

export interface IStructuredItem {
  title: string;
  description: string;
  item_type: 'feature' | 'task' | 'bug' | 'idea' | 'note';
  priority: 'high' | 'medium' | 'low';
  status?: 'pending' | 'in_progress' | 'done';
  children?: IStructuredItem[];
}

const CLI_PATH = 'claude';
const DEFAULT_ARGS = ['--dangerously-skip-permissions'];
const MODEL = 'sonnet';
const MAX_TURNS = 80;

export type OnTextChunk = (text: string) => void;
export type OnRawEvent = (event: Record<string, unknown>) => void;

/**
 * Spawn Claude Code CLI and collect the result text.
 * Optional onText callback receives streaming text chunks as they arrive.
 */
export function runClaude(prompt: string, onText?: OnTextChunk, onRawEvent?: OnRawEvent): Promise<string> {
  return new Promise((resolve, reject) => {
    const useStreamJson = !!(onText || onRawEvent);
    const args = [
      ...DEFAULT_ARGS,
      '--model', MODEL,
      ...(useStreamJson ? ['--output-format', 'stream-json', '--verbose'] : ['--output-format', 'text']),
      '--max-turns', String(MAX_TURNS),
      '-p', '-',  // read prompt from stdin
    ];

    // Strip Claude Code session env vars to avoid nested session detection
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
    delete cleanEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
    for (const key of Object.keys(cleanEnv)) {
      if (key.startsWith('CLAUDE_CODE_') || key === 'ANTHROPIC_PARENT_SESSION') {
        delete cleanEnv[key];
      }
    }

    const proc = spawn(CLI_PATH, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...cleanEnv, FORCE_COLOR: '0' },
    });

    // Write prompt to stdin and close it
    proc.stdin?.write(prompt);
    proc.stdin?.end();

    let buffer = '';
    let resultText = '';
    let stderrText = '';

    if (useStreamJson) {
      // stream-json mode: parse NDJSON events
      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            onRawEvent?.(parsed);

            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              resultText += parsed.delta.text;
              onText?.(parsed.delta.text);
            } else if (parsed.type === 'assistant' && parsed.message?.content) {
              let fullText = '';
              for (const block of parsed.message.content) {
                if (block.type === 'text') fullText += block.text;
              }
              if (fullText.length > resultText.length) {
                onText?.(fullText.slice(resultText.length));
              }
              resultText = fullText;
            } else if (parsed.type === 'result' && parsed.result) {
              if (parsed.result.length > resultText.length) {
                onText?.(parsed.result.slice(resultText.length));
              }
              resultText = parsed.result;
            }
          } catch { /* ignore non-JSON */ }
        }
      });
    } else {
      // text mode: stdout is the raw result
      proc.stdout?.on('data', (chunk: Buffer) => {
        resultText += chunk.toString();
      });
    }

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Claude CLI error: ${err.message}`));
    });

    proc.on('exit', (code, signal) => {
      // Clean up known CLI noise from text output
      if (!useStreamJson) {
        resultText = resultText.replace(/Error: Reached max turns \(\d+\)\s*/g, '').trim();
      }
      if (code !== 0 && !resultText) {
        const detail = stderrText.slice(0, 500) || (signal ? `killed by signal ${signal}` : 'no output');
        reject(new Error(`Claude CLI exited with code ${code}: ${detail}`));
        return;
      }
      resolve(resultText);
    });
  });
}

/**
 * Run Claude for free-form markdown analysis (not JSON).
 * Used for building the hub document in multi-agent analysis.
 */
export function runAnalysis(prompt: string, onText?: OnTextChunk, onRawEvent?: OnRawEvent): Promise<string> {
  return runClaude(prompt, onText, onRawEvent);
}

export function extractJson(text: string, type: 'array' | 'object'): string {
  // Strip markdown fences
  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`AI did not return valid JSON ${type}`);
  }
  return match[0];
}

export async function runStructure(brainstormContent: string, projectContext?: string, onText?: OnTextChunk, onRawEvent?: OnRawEvent): Promise<IStructuredItem[]> {
  const systemPrompt = `You are a JSON-only structuring machine. You NEVER respond with text, explanations, or conversation.
You ALWAYS output ONLY a raw JSON array, nothing else.

Your job: convert ANY input text into a structured JSON array of items.
Even if the input seems like a greeting or conversation, extract the implicit intent and structure it.

Schema per item:
{ "title": string, "description": string, "item_type": "feature"|"task"|"bug"|"idea"|"note", "priority": "high"|"medium"|"low", "status": "pending"|"in_progress"|"done", "children": [same schema] }

Rules:
- Output MUST start with [ and end with ]
- No markdown fences, no explanation, no text before or after the JSON
- Keep titles concise (under 50 chars)
- Group related ideas under parent items
- If input is vague, interpret it as best you can and create at least 1 item
- IMPORTANT: When project source code context is provided, judge the status based on the actual code:
  - "done": feature/task is fully implemented in the source code
  - "in_progress": partially implemented or has TODOs
  - "pending": not yet started or only planned
- If no source code context is provided, default status to "pending"`;

  const ctxBlock = projectContext ? `\n\n프로젝트 문서 컨텍스트:\n${projectContext}` : '';
  const prompt = `${systemPrompt}\n\nAnalyze this brainstorming content and structure it into a JSON tree:\n\n${brainstormContent}${ctxBlock}`;

  const resultText = await runClaude(prompt, onText, onRawEvent);
  const json = extractJson(resultText, 'array');
  return JSON.parse(json) as IStructuredItem[];
}

export async function runStructureWithQuestions(
  brainstormContent: string,
  conversationHistory: { role: 'assistant' | 'user'; content: string }[],
  projectContext?: string,
  onText?: OnTextChunk,
  onRawEvent?: OnRawEvent,
  existingStructure?: string,
): Promise<IStructureWithQuestions> {
  const systemPrompt = `You are an AI assistant that structures brainstorming content AND identifies ambiguous areas.
You ALWAYS output ONLY a raw JSON object (not an array), nothing else.

Your job:
1. Convert the brainstorming text into a structured JSON tree of items
2. Identify 0-5 areas where the brainstorming is ambiguous or could benefit from clarification
3. Consider the conversation history to avoid repeating questions already answered
4. If existing structured items are provided, UPDATE them rather than creating duplicates

Output schema:
{
  "items": [{ "title": string, "description": string, "item_type": "feature"|"task"|"bug"|"idea"|"note", "priority": "high"|"medium"|"low", "status": "pending"|"in_progress"|"done", "children": [same] }],
  "questions": [{ "anchor_text": string, "question": string }]
}

Rules:
- Output MUST be a JSON object with "items" and "questions" keys
- No markdown fences, no explanation, no text before or after the JSON
- Keep titles concise (under 50 chars)
- Group related ideas under parent items
- NEVER create duplicate items. If the existing structure already has an item for a concept, update it instead of adding a new one
- Merge similar items together. The output should be a clean, deduplicated structure
- Preserve the status of existing items unless the brainstorming text explicitly changes them
- questions[].anchor_text MUST be an exact substring from the brainstorming content (5-20 chars)
- questions[].question should be a helpful Korean question asking for clarification
- Generate 0-5 questions. Skip questions already answered in conversation history.
- If the brainstorming is clear enough, return an empty questions array
- All questions MUST be in Korean
- If project documentation context is provided, use it to make more informed structuring decisions (e.g., matching tech stack, conventions, existing patterns)
- IMPORTANT: When project source code context is provided, judge the status based on the actual code:
  - "done": feature/task is fully implemented in the source code
  - "in_progress": partially implemented or has TODOs
  - "pending": not yet started or only planned
- If no source code context is provided, default status to "pending"`;

  let historyContext = '';
  if (conversationHistory.length > 0) {
    historyContext = '\n\n이전 대화:\n' + conversationHistory
      .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
      .join('\n');
  }

  const ctxBlock = projectContext ? `\n\n프로젝트 문서 컨텍스트:\n${projectContext}` : '';
  const existingBlock = existingStructure ? `\n\n현재 구조화된 항목 (중복 생성하지 말고 업데이트하세요):\n${existingStructure}` : '';
  const prompt = `${systemPrompt}\n\n다음 브레인스토밍 내용을 분석하고 구조화하세요:\n\n${brainstormContent}${historyContext}${existingBlock}${ctxBlock}`;

  const resultText = await runClaude(prompt, onText, onRawEvent);
  const json = extractJson(resultText, 'object');
  const parsed = JSON.parse(json);

  return {
    items: parsed.items || [],
    questions: parsed.questions || [],
  } as IStructureWithQuestions;
}
