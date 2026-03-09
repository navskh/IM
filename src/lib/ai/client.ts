import { spawn } from 'node:child_process';

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
