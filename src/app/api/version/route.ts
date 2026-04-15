import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

// Read installed version from the package that is actually running.
// process.cwd() may differ when launched via the CLI, so we resolve
// relative to this file's runtime location by walking up.
function readInstalledVersion(): string {
  const candidates = [
    // Running from built standalone output
    join(process.cwd(), 'package.json'),
    // Running from source (dev)
    join(process.cwd(), '..', 'package.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      if (parsed.name === 'idea-manager' && typeof parsed.version === 'string') {
        return parsed.version;
      }
    } catch { /* try next */ }
  }
  return '0.0.0';
}

function cmp(a: string, b: string): number {
  const as = a.split('.').map(n => parseInt(n, 10));
  const bs = b.split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const av = as[i] ?? 0, bv = bs[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

interface CacheEntry { latest: string; at: number }
let cache: CacheEntry | null = null;
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

async function fetchLatest(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.latest;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://registry.npmjs.org/idea-manager/latest', {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    if (typeof data.version === 'string') {
      cache = { latest: data.version, at: Date.now() };
      return data.version;
    }
  } catch { /* network / timeout */ }
  return null;
}

export async function GET() {
  const current = readInstalledVersion();
  const latest = await fetchLatest();
  const updateAvailable = !!latest && cmp(latest, current) > 0;
  return NextResponse.json({ current, latest, updateAvailable });
}
