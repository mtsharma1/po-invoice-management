import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import {
  exchangeDropboxAuthorizationCode,
  getDropboxRedirectUri,
} from '@/lib/dropbox';

export const dynamic = 'force-dynamic';

function sameState(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length > 0 &&
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function settingsRedirect(request, key, message) {
  const url = new URL('/settings', request.url);
  url.searchParams.set(key, message);
  const response = NextResponse.redirect(url);
  response.cookies.delete('dropbox_oauth_state');
  return response;
}

export async function GET(request) {
  const session = await getCurrentSession();
  if (!session?.admin) {
    return settingsRedirect(
      request,
      'dropboxError',
      'Your administrator session expired. Sign in and connect Dropbox again.'
    );
  }

  const error = request.nextUrl.searchParams.get('error_description') ||
    request.nextUrl.searchParams.get('error');
  if (error) return settingsRedirect(request, 'dropboxError', error);

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get('dropbox_oauth_state')?.value;
  if (!sameState(state, expectedState)) {
    return settingsRedirect(
      request,
      'dropboxError',
      'Dropbox authorization validation failed. Please try connecting again.'
    );
  }
  if (!code) {
    return settingsRedirect(request, 'dropboxError', 'Dropbox did not return an authorization code.');
  }

  try {
    await exchangeDropboxAuthorizationCode({
      code,
      redirectUri: getDropboxRedirectUri(request.url),
      connectedBy: session.userId,
    });
    return settingsRedirect(request, 'dropboxConnected', '1');
  } catch (exchangeError) {
    return settingsRedirect(request, 'dropboxError', exchangeError.message);
  }
}
