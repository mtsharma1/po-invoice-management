import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'teakwood_session';

function sessionSecret() {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) throw new Error('APP_SESSION_SECRET is not configured.');
  return secret;
}

function sign(payload) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(user) {
  const hours = Math.max(1, Number(process.env.AUTH_SESSION_HOURS || 8));
  const session = {
    userId: String(user.UserID),
    access: Number(user.Access || 0),
    role: user.AccessDescription || 'User',
    admin: Boolean(user.AdminPane),
    expiresAt: Date.now() + hours * 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token) {
  try {
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra) return null;

    const expected = sign(payload);
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) return null;

    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.userId || !session.expiresAt || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  };
}
