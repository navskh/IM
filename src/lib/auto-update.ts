import { spawn, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function readInstalledVersion(pkgRoot: string): string {
  try {
    const raw = readFileSync(join(pkgRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function cmpVersion(a: string, b: string): number {
  const as = a.split('.').map(n => parseInt(n, 10) || 0);
  const bs = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://registry.npmjs.org/idea-manager/latest', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

function runNpmInstall(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', 'idea-manager@latest', '--no-fund', '--no-audit'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), 3 * 60 * 1000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export interface AutoUpdateResult {
  current: string;
  latest?: string;
  upgraded: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Check npm registry for a newer version and install it in place. Designed
 * for `im start` only — `im mcp` / `im watch` should NOT auto-update because
 * they may be long-running integrations where a mid-session restart is
 * disruptive.
 *
 * Opt-outs:
 *   - `IM_NO_AUTO_UPDATE=1` env var
 *   - `CI` env var (any truthy value)
 *   - Network timeout / registry unreachable → silently skipped
 *   - Failed `npm install` → logged, falls back to current version
 */
export async function maybeAutoUpdate(pkgRoot: string): Promise<AutoUpdateResult> {
  const current = readInstalledVersion(pkgRoot);

  if (process.env.IM_NO_AUTO_UPDATE === '1') {
    return { current, upgraded: false, skipped: true, reason: 'IM_NO_AUTO_UPDATE=1' };
  }
  if (process.env.CI) {
    return { current, upgraded: false, skipped: true, reason: 'CI environment' };
  }

  const latest = await fetchLatestVersion();
  if (!latest) {
    return { current, upgraded: false, skipped: true, reason: 'registry unreachable' };
  }
  if (cmpVersion(latest, current) <= 0) {
    return { current, latest, upgraded: false, skipped: false };
  }

  console.log('');
  console.log(`  IM — 새 버전 감지: v${current} → v${latest}`);
  console.log(`  업데이트 중... (IM_NO_AUTO_UPDATE=1로 건너뛸 수 있음)`);
  console.log('');

  const ok = await runNpmInstall();
  if (!ok) {
    console.log('');
    console.log(`  ⚠ 업데이트 실패 — 기존 v${current}로 계속 진행합니다.`);
    console.log('');
    return { current, latest, upgraded: false, skipped: false, reason: 'install failed' };
  }

  console.log('');
  console.log(`  ✓ v${latest} 설치 완료. 재시작합니다...`);
  console.log('');
  return { current, latest, upgraded: true, skipped: false };
}

/**
 * Re-exec the `im` CLI with the same arguments so the freshly installed code
 * replaces the old copy loaded in the current Node process. Sets
 * IM_NO_AUTO_UPDATE=1 on the child to prevent an update-respawn loop.
 */
function resolveImBin(): string | null {
  // After `npm install -g`, the im wrapper lives in npm's global bin.
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
    // On Windows the wrapper is `<prefix>\im.cmd`; on POSIX it's `<prefix>/bin/im`.
    const candidates = process.platform === 'win32'
      ? [join(prefix, 'im.cmd'), join(prefix, 'im.ps1'), join(prefix, 'im')]
      : [join(prefix, 'bin', 'im')];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  } catch { /* fall through */ }
  return null;
}

export function respawnSelf(): void {
  const args = process.argv.slice(2);
  const binPath = resolveImBin();
  const cmd = binPath ?? 'im';
  // On Windows, .cmd wrappers require shell:true (cmd.exe interprets them).
  // On POSIX, prefer shell:false with an absolute path for reliability.
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, IM_NO_AUTO_UPDATE: '1' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error(`  ⚠ 재시작 실패: ${err.message}`);
    console.error(`  직접 다시 실행해주세요: im ${args.join(' ')}`);
    process.exit(1);
  });
}
