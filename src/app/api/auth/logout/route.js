import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST(request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, //process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
