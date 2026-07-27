import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import {
  createDropboxAuthorizationUrl,
  getDropboxRedirectUri,
} from '@/lib/dropbox';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await getCurrentSession();
  if (!session?.admin) {
    return NextResponse.redirect(new URL('/dashboard?accessDenied=1', request.url));
  }

  try {
    const state = randomBytes(32).toString('base64url');
    const redirectUri = getDropboxRedirectUri(request.url);
    const authorizationUrl = createDropboxAuthorizationUrl({ redirectUri, state });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set('dropbox_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const url = new URL('/settings', request.url);
    url.searchParams.set('dropboxError', error.message);
    return NextResponse.redirect(url);
  }
}
