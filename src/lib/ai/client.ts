import { spawn } from 'node:child_process';
import { AGENTS } from './agents';
import type { AgentType } from '../../types';

export type OnTextChunk = (text: string) => void;
export type OnRawEvent = (event: Record<string, unknown>) => void;

export interface RunAgentOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Optional model override (e.g. "sonnet" for faster light tasks). */
  model?: string;
}

/**
 * Spawn an AI CLI agent and collect the result text.
 * Optional onText callback receives streaming text chunks as they arrive.
 */
export function runAgent(
  agentType: AgentType,
  prompt: string,
  onText?: OnTextChunk,
  onRawEvent?: OnRawEvent,
  options?: RunAgentOptions,
): Promise<string> {
  const config = AGENTS[agentType];
  if (!config) {
    return Promise.reject(new Error(`Unknown agent type: ${agentType}`));
  }

  return new Promise((resolve, reject) => {
    const useStreamJson = !!(onText || onRawEvent);
    const args = config.buildArgs({ streaming: useStreamJson, model: options?.model });
    const env = config.buildEnv();

    const proc = spawn(config.binary, args, {
      cwd: options?.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true,
      env,
    });

    // Timeout handling
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    if (options?.timeoutMs) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, options.timeoutMs);
    }

    // Spawn failure (e.g., binary not found) → reject instead of hanging.
    proc.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error(`${config.name} CLI not found on PATH. Install it first.`));
      } else {
        reject(new Error(`${config.name} CLI error: ${err.message}`));
      }
    });

    // Write prompt to stdin and close it. Wrap in try/catch for broken pipe cases.
    try {
      proc.stdin?.write(prompt, 'utf8');
      proc.stdin?.end();
    } catch (err) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      reject(new Error(`Failed to pipe prompt to ${config.name}: ${(err as Error).message}`));
      return;
    }

    let buffer = '';
    let resultText = '';
    let stderrText = '';
    let lastEmittedLength = 0;

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

            const event = config.parseStreamEvent(parsed);
            if (event) {
              if (event.final) {
                // Some agents emit cumulative text, emit only new portion
                if (event.final.length > lastEmittedLength) {
                  const newPart = event.final.slice(lastEmittedLength);
                  onText?.(newPart);
                  lastEmittedLength = event.final.length;
                }
                resultText = event.final;
              } else if (event.text) {
                resultText += event.text;
                lastEmittedLength = resultText.length;
                onText?.(event.text);
              }
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

    proc.on('exit', (code, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (!useStreamJson && config.cleanOutput) {
        resultText = config.cleanOutput(resultText);
      }
      if (timedOut) {
        reject(new Error(`${config.name} CLI timed out after ${Math.round((options?.timeoutMs || 0) / 1000)}s`));
        return;
      }
      if (code !== 0 && !resultText) {
        const detail = stderrText.slice(0, 500) || (signal ? `killed by signal ${signal}` : 'no output');
        reject(new Error(`${config.name} CLI exited with code ${code}: ${detail}`));
        return;
      }
      resolve(resultText);
    });
  });
}

// Backward compatibility
export function runClaude(prompt: string, onText?: OnTextChunk, onRawEvent?: OnRawEvent, options?: RunAgentOptions): Promise<string> {
  return runAgent('claude', prompt, onText, onRawEvent, options);
}
