import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/session';

function safeDestination(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard';
}

export async function POST(request) {
  const formData = await request.formData();
  const user = await authenticateUser(formData.get('userId'), formData.get('password'));
  if (!user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'Invalid user ID or password.');
    const next = safeDestination(formData.get('next'));
    if (next !== '/dashboard') url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  }

  const token = createSessionToken(user);
  const session = readSessionToken(token);
  const response = NextResponse.redirect(new URL(safeDestination(formData.get('next')), request.url), 303);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(session.expiresAt));
  return response;
}
