import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  loginSchema,
  notifyPrefsSchema,
  setPasswordSchema,
  updateProfileSchema,
} from '../../shared/schemas';
import type { Me, NotifyPrefs } from '../../shared/types';
import { hashPassword, sha256Hex, timingSafeEqual, verifyPassword } from '../auth/crypto';
import { DEFAULT_NOTIFY, prefsFromRow } from '../auth/notify';
import { createSession, destroySession, resolveSession } from '../auth/session';
import { parseBody, requireAuth } from '../middleware';
import type { AppEnv, SessionUser } from '../types';

type UserAuthRow = {
  id: number;
  name: string;
  visibleName: string | null;
  role: 'admin' | 'member';
  active: number;
  passwordHash: string | null;
  passwordSalt: string | null;
  notifyMessages: number;
  notifyMentions: number;
  notifyVotes: number;
  notifyPlaces: number;
  notifyLinks: number;
};

function toMe(user: {
  id: number;
  name: string;
  visibleName: string | null;
  role: 'admin' | 'member';
  hasPassword: boolean;
  notify: NotifyPrefs;
}): Me {
  return {
    ...user,
    mustSetPassword: user.role === 'admin' && !user.hasPassword,
  };
}

function sessionToMe(user: SessionUser): Me {
  return toMe(user);
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
      `SELECT id, name, visible_name AS visibleName, role, active,
              password_hash AS passwordHash, password_salt AS passwordSalt,
              notify_messages AS notifyMessages, notify_mentions AS notifyMentions,
              notify_votes AS notifyVotes, notify_places AS notifyPlaces,
              notify_links AS notifyLinks
         FROM users WHERE name = ? COLLATE NOCASE`,
    )
      .bind(name)
      .first<UserAuthRow>();

    const invalid = new HTTPException(401, { message: 'Špatné jméno nebo heslo' });
    if (!user || user.active !== 1) throw invalid;

    // Admin bootstrap: the seeded secret works only until a real password is set.
    const bootstrapping = user.role === 'admin' && user.passwordHash === null;
    const ok = bootstrapping
      ? timingSafeEqual(password, c.env.ADMIN_INITIAL_PASSWORD)
      : await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!ok) throw invalid;

    await createSession(c, user.id);
    return c.json(
      toMe({
        id: user.id,
        name: user.name,
        visibleName: user.visibleName,
        role: user.role,
        hasPassword: !bootstrapping,
        notify: prefsFromRow(user),
      }),
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
    return c.json({ user: sessionToMe(user) });
  })

  .patch('/profile', requireAuth, async (c) => {
    const { visibleName } = await parseBody(c, updateProfileSchema);
    const me = c.get('user');
    await c.env.DB.prepare('UPDATE users SET visible_name = ? WHERE id = ?')
      .bind(visibleName, me.id)
      .run();

    return c.json(
      toMe({
        id: me.id,
        name: me.name,
        visibleName,
        role: me.role,
        hasPassword: me.hasPassword,
        notify: me.notify ?? DEFAULT_NOTIFY,
      }),
    );
  })

  .patch('/notify', requireAuth, async (c) => {
    const prefs = await parseBody(c, notifyPrefsSchema);
    const me = c.get('user');
    await c.env.DB.prepare(
      `UPDATE users SET
          notify_messages = ?, notify_mentions = ?, notify_votes = ?,
          notify_places = ?, notify_links = ?
        WHERE id = ?`,
    )
      .bind(
        prefs.messages ? 1 : 0,
        prefs.mentions ? 1 : 0,
        prefs.votes ? 1 : 0,
        prefs.places ? 1 : 0,
        prefs.links ? 1 : 0,
        me.id,
      )
      .run();

    return c.json(
      toMe({
        id: me.id,
        name: me.name,
        visibleName: me.visibleName,
        role: me.role,
        hasPassword: me.hasPassword,
        notify: prefs,
      }),
    );
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
      if (!ok) throw new HTTPException(400, { message: 'Současné heslo nesedí' });
    }

    const { hash, salt } = await hashPassword(next);
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
      .bind(hash, salt, me.id)
      .run();

    return c.json(
      toMe({
        id: me.id,
        name: me.name,
        visibleName: me.visibleName,
        role: me.role,
        hasPassword: true,
        notify: me.notify ?? DEFAULT_NOTIFY,
      }),
    );
  });
