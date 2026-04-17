import { NextRequest, NextResponse } from 'next/server';

// Reject cross-origin mutations on /api/* routes to prevent CSRF:
// a malicious site opened in the user's browser while IM is running could
// otherwise POST to localhost:3456/api/update (or any mutation endpoint).
//
// - Same-origin browser requests include matching Origin → allowed
// - Non-browser clients (curl, MCP stdio callers) usually omit Origin → allowed
// - Cross-origin browser requests have a non-local Origin → blocked

const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  if (!MUTATION_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    // No Origin header: likely a non-browser client (curl, Claude MCP, etc.).
    // These run locally and are trusted.
    return NextResponse.next();
  }

  if (isLocalOrigin(origin)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'Cross-origin requests are not allowed' },
    { status: 403 },
  );
}

export const config = {
  matcher: '/api/:path*',
};
