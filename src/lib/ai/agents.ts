import type { AgentType } from '../../types';

export interface AgentConfig {
  name: string;
  binary: string;
  buildArgs: (opts: { streaming: boolean; model?: string }) => string[];
  buildEnv: () => NodeJS.ProcessEnv;
  parseStreamEvent: (parsed: Record<string, unknown>) => { text?: string; final?: string } | null;
  cleanOutput?: (text: string) => string;
}

const claudeConfig: AgentConfig = {
  name: 'Claude',
  binary: 'claude',
  buildArgs: ({ streaming, model }) => [
    '--dangerously-skip-permissions',
    '--model', model || 'opus',
    ...(streaming
      ? ['--output-format', 'stream-json', '--verbose']
      : ['--output-format', 'text']),
    '--max-turns', '80',
    '-p', '-',
  ],
  buildEnv: () => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
    for (const key of Object.keys(env)) {
      if (key.startsWith('CLAUDE_CODE_') || key === 'ANTHROPIC_PARENT_SESSION') {
        delete env[key];
      }
    }
    return { ...env, FORCE_COLOR: '0' };
  },
  parseStreamEvent: (parsed) => {
    if (parsed.type === 'content_block_delta' && (parsed.delta as Record<string, unknown>)?.text) {
      return { text: (parsed.delta as Record<string, unknown>).text as string };
    }
    if (parsed.type === 'assistant' && (parsed.message as Record<string, unknown>)?.content) {
      let t = '';
      for (const b of (parsed.message as Record<string, unknown>).content as { type: string; text?: string }[]) {
        if (b.type === 'text') t += b.text;
      }
      return { final: t };
    }
    if (parsed.type === 'result' && parsed.result) {
      return { final: parsed.result as string };
    }
    return null;
  },
  cleanOutput: (text) => text.replace(/Error: Reached max turns \(\d+\)\s*/g, '').trim(),
};

const geminiConfig: AgentConfig = {
  name: 'Gemini',
  binary: 'gemini',
  buildArgs: ({ streaming }) => [
    '--yolo',
    '-m', 'gemini-2.5-flash',
    ...(streaming
      ? ['--output-format', 'stream-json']
      : ['--output-format', 'json']),
    '-p', '-',
  ],
  buildEnv: () => ({ ...process.env, FORCE_COLOR: '0' }),
  parseStreamEvent: (parsed) => {
    if (parsed.type === 'content_block_delta' && (parsed.delta as Record<string, unknown>)?.text) {
      return { text: (parsed.delta as Record<string, unknown>).text as string };
    }
    if (parsed.type === 'result') {
      return { final: (parsed.response || parsed.text || parsed.result) as string };
    }
    return null;
  },
  cleanOutput: (text) => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) return trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      return (parsed.response || parsed.text || parsed.result || trimmed) as string;
    } catch {
      return trimmed;
    }
  },
};

const codexConfig: AgentConfig = {
  name: 'Codex',
  binary: 'codex',
  buildArgs: ({ streaming }) => [
    'exec',
    '--full-auto',
    ...(streaming ? ['--json'] : []),
    '-',
  ],
  buildEnv: () => ({ ...process.env, FORCE_COLOR: '0' }),
  parseStreamEvent: (parsed) => {
    if (parsed.type === 'item.completed' && (parsed.item as Record<string, unknown>)?.type === 'agent_message') {
      return { final: (parsed.item as Record<string, unknown>).text as string };
    }
    if (parsed.type === 'item.updated' && (parsed.item as Record<string, unknown>)?.type === 'agent_message') {
      return { text: (parsed.item as Record<string, unknown>).text as string };
    }
    return null;
  },
};

export const AGENTS: Record<AgentType, AgentConfig> = {
  claude: claudeConfig,
  gemini: geminiConfig,
  codex: codexConfig,
};
