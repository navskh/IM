import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

// Runs `npm install -g idea-manager@latest` as the current user. This only
// makes sense for local installs of IM — the API is same-origin so there's no
// remote caller to worry about. After a successful install the running Node
// process still holds the OLD code; the response tells the client to prompt
// the user to restart `im start` (or to let PM2 auto-restart).
export async function POST() {
  const started = Date.now();
  return await new Promise<Response>((resolve) => {
    const child = spawn('npm', ['install', '-g', 'idea-manager@latest', '--no-fund', '--no-audit'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });

    // 3-minute hard timeout — npm install on stale registry can hang otherwise.
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 3 * 60 * 1000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve(NextResponse.json({
        ok: false,
        error: err.message,
        durationMs: Date.now() - started,
      }, { status: 500 }));
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      const ok = code === 0;
      resolve(NextResponse.json({
        ok,
        code,
        signal: signal ?? null,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
        durationMs: Date.now() - started,
      }, { status: ok ? 200 : 500 }));
    });
  });
}
