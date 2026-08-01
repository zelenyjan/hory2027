import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hmacSha256Hex, randomTokenBase64Url } from './crypto';
import type { AppEnv, SessionUser } from '../types';

export const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 90;
/** Sessions closer than this to expiry get their lifetime pushed back out on use. */
const SLIDING_REFRESH_DAYS = 80;

const dayMs = 24 * 60 * 60 * 1000;

function expiryFromNow(days: number): string {
  return new Date(Date.now() + days * dayMs).toISOString();
}

export async function createSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = randomTokenBase64Url();
  const idHash = await hmacSha256Hex(c.env.SESSION_SECRET, token);
  await c.env.DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(idHash, userId, expiryFromNow(SESSION_DAYS))
    .run();

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const idHash = await hmacSha256Hex(c.env.SESSION_SECRET, token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function resolveSession(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const idHash = await hmacSha256Hex(c.env.SESSION_SECRET, token);
  const row = await c.env.DB.prepare(
    `SELECT s.id_hash AS idHash, s.expires_at AS expiresAt,
            u.id, u.name, u.role, u.active, u.password_hash AS passwordHash
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ?`,
  )
    .bind(idHash)
    .first<{
      idHash: string;
      expiresAt: string;
      id: number;
      name: string;
      role: 'admin' | 'member';
      active: number;
      passwordHash: string | null;
    }>();

  if (!row) return null;
  if (Date.parse(row.expiresAt) < Date.now() || row.active !== 1) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
    return null;
  }

  if (Date.parse(row.expiresAt) < Date.now() + SLIDING_REFRESH_DAYS * dayMs) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?')
        .bind(expiryFromNow(SESSION_DAYS), idHash)
        .run(),
    );
  }
  c.executionCtx.waitUntil(
    c.env.DB.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?")
      .bind(row.id)
      .run(),
  );

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    hasPassword: row.passwordHash !== null,
  };
}

export async function deleteUserSessions(db: D1Database, userId: number): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}
