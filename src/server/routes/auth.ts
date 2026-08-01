import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { loginSchema, setPasswordSchema } from '../../shared/schemas';
import type { Me } from '../../shared/types';
import { hashPassword, sha256Hex, timingSafeEqual, verifyPassword } from '../auth/crypto';
import { createSession, destroySession, resolveSession } from '../auth/session';
import { parseBody, requireAuth } from '../middleware';
import type { AppEnv } from '../types';

type UserAuthRow = {
  id: number;
  name: string;
  role: 'admin' | 'member';
  active: number;
  passwordHash: string | null;
  passwordSalt: string | null;
};

function toMe(user: {
  id: number;
  name: string;
  role: 'admin' | 'member';
  hasPassword: boolean;
}): Me {
  return {
    ...user,
    mustSetPassword: user.role === 'admin' && !user.hasPassword,
  };
}

/** Invite link: trade the one-and-only token for a session, then land in the app. */
export async function handleJoin(c: Context<AppEnv>): Promise<Response> {
  const tokenHash = await sha256Hex(c.req.param('token') ?? '');
  const user = await c.env.DB.prepare(
    'SELECT id, active, invite_revoked AS inviteRevoked FROM users WHERE invite_token_hash = ?',
  )
    .bind(tokenHash)
    .first<{ id: number; active: number; inviteRevoked: number }>();

  if (!user || user.active !== 1 || user.inviteRevoked === 1) {
    return c.redirect('/login?error=invite', 302);
  }
  await createSession(c, user.id);
  return c.redirect('/', 302);
}

export const authRoutes = new Hono<AppEnv>()
  .post('/login', async (c) => {
    const { name, password } = await parseBody(c, loginSchema);
    const user = await c.env.DB.prepare(
      `SELECT id, name, role, active, password_hash AS passwordHash, password_salt AS passwordSalt
         FROM users WHERE name = ? COLLATE NOCASE`,
    )
      .bind(name)
      .first<UserAuthRow>();

    const invalid = new HTTPException(401, { message: 'Wrong name or password' });
    if (!user || user.active !== 1) throw invalid;

    // Admin bootstrap: the seeded secret works only until a real password is set.
    const bootstrapping = user.role === 'admin' && user.passwordHash === null;
    const ok = bootstrapping
      ? timingSafeEqual(password, c.env.ADMIN_INITIAL_PASSWORD)
      : await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!ok) throw invalid;

    await createSession(c, user.id);
    return c.json(
      toMe({ id: user.id, name: user.name, role: user.role, hasPassword: !bootstrapping }),
    );
  })

  .get('/join/:token', handleJoin)

  .post('/logout', async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  })

  .get('/me', async (c) => {
    const user = await resolveSession(c);
    if (!user) return c.json({ user: null });
    return c.json({ user: toMe(user) });
  })

  .post('/password', requireAuth, async (c) => {
    const { current, next } = await parseBody(c, setPasswordSchema);
    const me = c.get('user');

    if (me.hasPassword) {
      const row = await c.env.DB.prepare(
        'SELECT password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE id = ?',
      )
        .bind(me.id)
        .first<{ passwordHash: string | null; passwordSalt: string | null }>();
      const ok = await verifyPassword(
        current ?? '',
        row?.passwordHash ?? null,
        row?.passwordSalt ?? null,
      );
      if (!ok) throw new HTTPException(400, { message: 'Current password is wrong' });
    }

    const { hash, salt } = await hashPassword(next);
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
      .bind(hash, salt, me.id)
      .run();

    return c.json(toMe({ ...me, hasPassword: true }));
  });
