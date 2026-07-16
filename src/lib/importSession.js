import { cookies } from 'next/headers';

export const IMPORT_SESSION_COOKIE = 'tw_import_session';
export const DEFAULT_IMPORT_SESSION = 'default-import-session';

export async function getImportSessionId({ create = false } = {}) {
  const cookieStore = await cookies();
  const existing = cookieStore.get(IMPORT_SESSION_COOKIE)?.value;
  if (existing) return existing;

  if (!create) return DEFAULT_IMPORT_SESSION;

  const sessionId = crypto.randomUUID();
  cookieStore.set(IMPORT_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return sessionId;
}
