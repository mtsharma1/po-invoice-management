import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { query } from './db';
import { readSessionToken, SESSION_COOKIE } from './session';

function sameText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function authenticateUser(userId, password) {
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId || !password) return null;

  const rows = await query(
    `SELECT u.ID, u.UserID, u.PWD, u.Access,
            COALESCE(a.AccessDescription, 'User') AS AccessDescription,
            COALESCE(a.AdminPane, 0) AS AdminPane
      FROM tblUsers u
       LEFT JOIN tblAccessType a ON a.AccessType = u.Access
      WHERE u.UserID = ?
        AND COALESCE(u.isActive, 1) = 1
      LIMIT 1`,
    [cleanUserId]
  );
  const user = rows[0];
  if (!user || !sameText(user.PWD, password)) return null;
  return user;
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}
