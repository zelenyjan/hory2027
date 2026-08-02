import type { Message, MessagePage, MessageRead, UserRef } from '../../shared/types';

type MessageRow = {
  id: number;
  userId: number;
  userName: string;
  body: string;
  quotedMessageId: number | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  quotedUserName: string | null;
  quotedBody: string | null;
  quotedDeletedAt: string | null;
};

const SELECT_MESSAGE = `
  SELECT m.id, m.user_id AS userId, u.name AS userName, m.body,
         m.quoted_message_id AS quotedMessageId, m.created_at AS createdAt,
         m.edited_at AS editedAt, m.deleted_at AS deletedAt,
         qu.name AS quotedUserName, q.body AS quotedBody, q.deleted_at AS quotedDeletedAt
    FROM messages m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN messages q ON q.id = m.quoted_message_id
    LEFT JOIN users qu ON qu.id = q.user_id`;

function mapRow(
  row: MessageRow,
  reactions: Message['reactions'],
  mentions: UserRef[],
): Message {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    body: deleted ? '' : row.body,
    quotedMessageId: row.quotedMessageId,
    quoted:
      row.quotedMessageId !== null && row.quotedUserName !== null
        ? {
            id: row.quotedMessageId,
            userName: row.quotedUserName,
            body: row.quotedDeletedAt !== null ? '' : (row.quotedBody ?? ''),
            deleted: row.quotedDeletedAt !== null,
          }
        : null,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deleted,
    reactions,
    mentions: deleted ? [] : mentions,
  };
}

async function reactionsFor(
  db: D1Database,
  ids: number[],
): Promise<Map<number, Message['reactions']>> {
  const byMessage = new Map<number, Message['reactions']>();
  if (ids.length === 0) return byMessage;

  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT r.message_id AS messageId, r.emoji, r.user_id AS userId, u.name
         FROM reactions r JOIN users u ON u.id = r.user_id
        WHERE r.message_id IN (${placeholders})
        ORDER BY r.emoji`,
    )
    .bind(...ids)
    .all<{ messageId: number; emoji: string; userId: number; name: string }>();

  for (const row of results) {
    const list = byMessage.get(row.messageId) ?? [];
    const entry = list.find((r) => r.emoji === row.emoji);
    const user: UserRef = { userId: row.userId, name: row.name };
    if (entry) entry.users.push(user);
    else list.push({ emoji: row.emoji, users: [user] });
    byMessage.set(row.messageId, list);
  }
  return byMessage;
}

async function mentionsFor(db: D1Database, ids: number[]): Promise<Map<number, UserRef[]>> {
  const byMessage = new Map<number, UserRef[]>();
  if (ids.length === 0) return byMessage;

  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT m.message_id AS messageId, m.user_id AS userId, u.name
         FROM message_mentions m JOIN users u ON u.id = m.user_id
        WHERE m.message_id IN (${placeholders})
        ORDER BY u.name`,
    )
    .bind(...ids)
    .all<{ messageId: number; userId: number; name: string }>();

  for (const row of results) {
    const list = byMessage.get(row.messageId) ?? [];
    list.push({ userId: row.userId, name: row.name });
    byMessage.set(row.messageId, list);
  }
  return byMessage;
}

export function encodeCursor(message: { createdAt: string; id: number }): string {
  return `${message.createdAt}|${message.id}`;
}

function decodeCursor(cursor: string): { createdAt: string; id: number } | null {
  const idx = cursor.lastIndexOf('|');
  if (idx < 0) return null;
  const id = Number(cursor.slice(idx + 1));
  if (!Number.isInteger(id)) return null;
  return { createdAt: cursor.slice(0, idx), id };
}

/** Newest-first page; the client reverses for display and pages upward. */
export async function listMessages(
  db: D1Database,
  limit: number,
  cursor?: string,
): Promise<MessagePage> {
  const decoded = cursor ? decodeCursor(cursor) : null;
  const statement = decoded
    ? db
        .prepare(
          `${SELECT_MESSAGE}
            WHERE m.created_at < ?1 OR (m.created_at = ?1 AND m.id < ?2)
            ORDER BY m.created_at DESC, m.id DESC LIMIT ?3`,
        )
        .bind(decoded.createdAt, decoded.id, limit + 1)
    : db
        .prepare(`${SELECT_MESSAGE} ORDER BY m.created_at DESC, m.id DESC LIMIT ?1`)
        .bind(limit + 1);

  const { results } = await statement.all<MessageRow>();
  const hasMore = results.length > limit;
  const rows = hasMore ? results.slice(0, limit) : results;
  const ids = rows.map((r) => r.id);
  const reactions = await reactionsFor(db, ids);
  const mentions = await mentionsFor(db, ids);
  const messages = rows.map((row) =>
    mapRow(row, reactions.get(row.id) ?? [], mentions.get(row.id) ?? []),
  );

  return {
    messages: messages.reverse(),
    nextCursor: hasMore && rows.length > 0 ? encodeCursor(rows[rows.length - 1]!) : null,
  };
}

export async function getMessage(db: D1Database, id: number): Promise<Message | null> {
  const row = await db.prepare(`${SELECT_MESSAGE} WHERE m.id = ?`).bind(id).first<MessageRow>();
  if (!row) return null;
  const reactions = await reactionsFor(db, [id]);
  const mentions = await mentionsFor(db, [id]);
  return mapRow(row, reactions.get(id) ?? [], mentions.get(id) ?? []);
}

export async function replaceMentions(
  db: D1Database,
  messageId: number,
  userIds: number[],
): Promise<void> {
  await db.prepare('DELETE FROM message_mentions WHERE message_id = ?').bind(messageId).run();
  if (userIds.length === 0) return;
  await db.batch(
    userIds.map((userId) =>
      db
        .prepare('INSERT INTO message_mentions (message_id, user_id) VALUES (?, ?)')
        .bind(messageId, userId),
    ),
  );
}

export async function listActiveMembers(
  db: D1Database,
): Promise<{ id: number; name: string }[]> {
  const { results } = await db
    .prepare('SELECT id, name FROM users WHERE active = 1 ORDER BY name COLLATE NOCASE')
    .all<{ id: number; name: string }>();
  return results;
}

/** Everyone active, so the client can also tell who has *not* caught up yet. */
export async function listReads(db: D1Database): Promise<MessageRead[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id AS userId, u.name, COALESCE(r.last_read_message_id, 0) AS lastReadMessageId
         FROM users u LEFT JOIN message_reads r ON r.user_id = u.id
        WHERE u.active = 1 ORDER BY u.name COLLATE NOCASE`,
    )
    .all<MessageRead>();
  return results;
}

const UNREAD_PER_USER = `
  SELECT u.id AS userId,
         (SELECT COUNT(*) FROM messages m
           WHERE m.deleted_at IS NULL AND m.user_id != u.id
             AND m.id > COALESCE(
                   (SELECT last_read_message_id FROM message_reads r WHERE r.user_id = u.id), 0)
         ) AS unread
    FROM users u WHERE u.active = 1`;

export async function unreadCounts(db: D1Database): Promise<Map<number, number>> {
  const { results } = await db.prepare(UNREAD_PER_USER).all<{ userId: number; unread: number }>();
  return new Map(results.map((row) => [row.userId, row.unread]));
}

export async function unreadCount(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare(`SELECT unread FROM (${UNREAD_PER_USER}) WHERE userId = ?`)
    .bind(userId)
    .first<{ unread: number }>();
  return row?.unread ?? 0;
}

/** High-water mark: never moves backwards, never past the newest message that exists. */
export async function markRead(db: D1Database, userId: number, messageId: number): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO message_reads (user_id, last_read_message_id)
       VALUES (?1, MIN(?2, (SELECT COALESCE(MAX(id), 0) FROM messages)))
       ON CONFLICT (user_id) DO UPDATE
          SET last_read_message_id = MAX(excluded.last_read_message_id, last_read_message_id),
              updated_at = datetime('now')
       RETURNING last_read_message_id AS lastReadMessageId`,
    )
    .bind(userId, messageId)
    .first<{ lastReadMessageId: number }>();
  return row!.lastReadMessageId;
}

export async function insertMessage(
  db: D1Database,
  userId: number,
  body: string,
  quotedMessageId: number | null,
): Promise<number> {
  const row = await db
    .prepare(
      'INSERT INTO messages (user_id, body, quoted_message_id) VALUES (?, ?, ?) RETURNING id',
    )
    .bind(userId, body, quotedMessageId)
    .first<{ id: number }>();
  return row!.id;
}
