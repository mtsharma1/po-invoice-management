import { NextResponse } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from '@/lib/session';
import { canAccessPath } from '@/lib/permissions';

export function proxy(request) {
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  if (!session && isApi) {
    return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
  }

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(session, request.nextUrl.pathname)) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: 'You do not have access to this function.' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/dashboard?accessDenied=1', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|qr.png).*)'],
};
