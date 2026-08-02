import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createUserSchema, updateUserSchema } from '../../shared/schemas';
import type { AdminUser } from '../../shared/types';
import { randomTokenBase64Url, sha256Hex } from '../auth/crypto';
import { deleteUserSessions } from '../auth/session';
import { intParam, parseBody } from '../middleware';
import type { AppEnv } from '../types';

type AdminUserRow = {
  id: number;
  name: string;
  role: 'admin' | 'member';
  active: number;
  passwordHash: string | null;
  inviteTokenHash: string | null;
  inviteRevoked: number;
  lastSeenAt: string | null;
  createdAt: string;
};

function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active === 1,
    hasPassword: row.passwordHash !== null,
    hasInvite: row.inviteTokenHash !== null,
    inviteRevoked: row.inviteRevoked === 1,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

const SELECT_USER = `
  SELECT id, name, role, active, password_hash AS passwordHash,
         invite_token_hash AS inviteTokenHash, invite_revoked AS inviteRevoked,
         last_seen_at AS lastSeenAt, created_at AS createdAt
    FROM users`;

function inviteUrl(requestUrl: string, token: string): string {
  return new URL(`/join/${token}`, requestUrl).toString();
}

async function issueInvite(c: Context<AppEnv>, userId: number): Promise<string> {
  const token = randomTokenBase64Url();
  await c.env.DB.prepare('UPDATE users SET invite_token_hash = ?, invite_revoked = 0 WHERE id = ?')
    .bind(await sha256Hex(token), userId)
    .run();
  return inviteUrl(c.req.url, token);
}

export const adminRoutes = new Hono<AppEnv>()
  .get('/users', async (c) => {
    const { results } = await c.env.DB.prepare(
      `${SELECT_USER} ORDER BY role = 'admin' DESC, name COLLATE NOCASE`,
    ).all<AdminUserRow>();
    return c.json(results.map(toAdminUser));
  })

  .post('/users', async (c) => {
    const { name } = await parseBody(c, createUserSchema);
    const clash = await c.env.DB.prepare('SELECT 1 FROM users WHERE name = ? COLLATE NOCASE')
      .bind(name)
      .first();
    if (clash) throw new HTTPException(409, { message: 'Tohle jméno už někdo má' });

    const row = await c.env.DB.prepare('INSERT INTO users (name) VALUES (?) RETURNING id')
      .bind(name)
      .first<{ id: number }>();

    return c.json({ id: row!.id, name, inviteUrl: await issueInvite(c, row!.id) }, 201);
  })

  .post('/users/:id/invite', async (c) => {
    const id = intParam(c, 'id');
    const user = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?')
      .bind(id)
      .first<{ role: string }>();
    if (!user) throw new HTTPException(404, { message: 'Uživatel nenalezen' });
    if (user.role === 'admin')
      throw new HTTPException(400, { message: 'Admin nemá pozvánkový odkaz' });

    return c.json({ inviteUrl: await issueInvite(c, id) });
  })

  .delete('/users/:id/invite', async (c) => {
    const id = intParam(c, 'id');
    await c.env.DB.prepare('UPDATE users SET invite_revoked = 1 WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  })

  .patch('/users/:id', async (c) => {
    const id = intParam(c, 'id');
    const patch = await parseBody(c, updateUserSchema);
    const target = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?')
      .bind(id)
      .first<{ role: string }>();
    if (!target) throw new HTTPException(404, { message: 'Uživatel nenalezen' });
    if (target.role === 'admin' && patch.active === false) {
      throw new HTTPException(400, { message: 'Admina nelze deaktivovat' });
    }

    if (patch.name !== undefined) {
      const clash = await c.env.DB.prepare(
        'SELECT 1 FROM users WHERE name = ? COLLATE NOCASE AND id <> ?',
      )
        .bind(patch.name, id)
        .first();
      if (clash) throw new HTTPException(409, { message: 'Tohle jméno už někdo má' });
      await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(patch.name, id).run();
    }

    if (patch.active !== undefined) {
      await c.env.DB.prepare('UPDATE users SET active = ? WHERE id = ?')
        .bind(patch.active ? 1 : 0, id)
        .run();
      if (!patch.active) await deleteUserSessions(c.env.DB, id);
    }

    const row = await c.env.DB.prepare(`${SELECT_USER} WHERE id = ?`)
      .bind(id)
      .first<AdminUserRow>();
    return c.json(toAdminUser(row!));
  });
