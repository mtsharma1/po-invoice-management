import { cookies } from 'next/headers';

export const DISPATCH_SESSION_COOKIE = 'tw_dispatch_session';
export const DEFAULT_DISPATCH_SESSION = 'default-dispatch-session';

export async function getDispatchSessionId({ create = false } = {}) {
  const cookieStore = await cookies();
  const existing = cookieStore.get(DISPATCH_SESSION_COOKIE)?.value;
  if (existing) return existing;

  if (!create) return DEFAULT_DISPATCH_SESSION;

  const sessionId = crypto.randomUUID();
  cookieStore.set(DISPATCH_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return sessionId;
}
