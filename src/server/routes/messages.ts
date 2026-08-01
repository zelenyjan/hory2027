import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { emojify } from '../../shared/emoticons';
import {
  createMessageSchema,
  markReadSchema,
  toggleReactionSchema,
  updateMessageSchema,
} from '../../shared/schemas';
import {
  getMessage,
  insertMessage,
  listMessages,
  listReads,
  markRead,
  unreadCount,
} from '../db/messages';
import { broadcast, intParam, parseBody } from '../middleware';
import { notifyOthers, preview } from '../push/notify';
import type { AppEnv } from '../types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

async function loadMessageRow(c: Context<AppEnv>, id: number) {
  const row = await c.env.DB.prepare(
    'SELECT user_id AS userId, deleted_at AS deletedAt FROM messages WHERE id = ?',
  )
    .bind(id)
    .first<{ userId: number; deletedAt: string | null }>();
  if (!row) throw new HTTPException(404, { message: 'Message not found' });
  return row;
}

export const messageRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || DEFAULT_LIMIT, MAX_LIMIT);
    const page = await listMessages(c.env.DB, limit, c.req.query('cursor'));
    return c.json(page);
  })

  .post('/', async (c) => {
    const { body, quotedMessageId } = await parseBody(c, createMessageSchema);
    const user = c.get('user');

    if (quotedMessageId) {
      const exists = await c.env.DB.prepare('SELECT 1 FROM messages WHERE id = ?')
        .bind(quotedMessageId)
        .first();
      if (!exists) throw new HTTPException(400, { message: 'Quoted message not found' });
    }

    const id = await insertMessage(c.env.DB, user.id, emojify(body), quotedMessageId ?? null);
    const message = (await getMessage(c.env.DB, id))!;
    broadcast(c, { type: 'message.created', payload: message });
    notifyOthers(c, user.id, {
      title: user.name,
      body: preview(message.body),
      url: '/',
      tag: 'chat',
    });
    return c.json(message, 201);
  })

  .get('/reads', async (c) => c.json(await listReads(c.env.DB)))

  .get('/unread', async (c) => c.json({ count: await unreadCount(c.env.DB, c.get('user').id) }))

  .post('/read', async (c) => {
    const { messageId } = await parseBody(c, markReadSchema);
    const user = c.get('user');
    const lastReadMessageId = await markRead(c.env.DB, user.id, messageId);
    broadcast(c, {
      type: 'message.read',
      payload: { userId: user.id, name: user.name, lastReadMessageId },
    });
    return c.json({ lastReadMessageId });
  })

  .patch('/:id', async (c) => {
    const id = intParam(c, 'id');
    const { body } = await parseBody(c, updateMessageSchema);
    const row = await loadMessageRow(c, id);
    if (row.userId !== c.get('user').id)
      throw new HTTPException(403, { message: 'Not your message' });
    if (row.deletedAt) throw new HTTPException(400, { message: 'Message is deleted' });

    await c.env.DB.prepare("UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?")
      .bind(emojify(body), id)
      .run();
    const message = (await getMessage(c.env.DB, id))!;
    broadcast(c, { type: 'message.updated', payload: message });
    return c.json(message);
  })

  .delete('/:id', async (c) => {
    const id = intParam(c, 'id');
    const user = c.get('user');
    const row = await loadMessageRow(c, id);
    if (row.userId !== user.id && user.role !== 'admin') {
      throw new HTTPException(403, { message: 'Not allowed' });
    }

    await c.env.DB.prepare(
      "UPDATE messages SET body = '', deleted_at = datetime('now') WHERE id = ?",
    )
      .bind(id)
      .run();
    await c.env.DB.prepare('DELETE FROM reactions WHERE message_id = ?').bind(id).run();

    const message = (await getMessage(c.env.DB, id))!;
    broadcast(c, { type: 'message.deleted', payload: message });
    return c.json(message);
  })

  .put('/:id/reactions', async (c) => {
    const id = intParam(c, 'id');
    const { emoji } = await parseBody(c, toggleReactionSchema);
    const user = c.get('user');
    const row = await loadMessageRow(c, id);
    if (row.deletedAt) throw new HTTPException(400, { message: 'Message is deleted' });

    const existing = await c.env.DB.prepare(
      'SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    )
      .bind(id, user.id, emoji)
      .first();

    if (existing) {
      await c.env.DB.prepare(
        'DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      )
        .bind(id, user.id, emoji)
        .run();
    } else {
      await c.env.DB.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
        .bind(id, user.id, emoji)
        .run();
    }

    broadcast(c, {
      type: 'reaction.toggled',
      payload: { messageId: id, userId: user.id, userName: user.name, emoji, added: !existing },
    });
    return c.json({ added: !existing });
  });
