import type { Message, MessagePage, UserRef } from '../../shared/types';

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

function mapRow(row: MessageRow, reactions: Message['reactions']): Message {
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
  const reactions = await reactionsFor(
    db,
    rows.map((r) => r.id),
  );
  const messages = rows.map((row) => mapRow(row, reactions.get(row.id) ?? []));

  return {
    messages: messages.reverse(),
    nextCursor:
      hasMore && rows.length > 0 ? encodeCursor(mapRow(rows[rows.length - 1]!, [])) : null,
  };
}

export async function getMessage(db: D1Database, id: number): Promise<Message | null> {
  const row = await db.prepare(`${SELECT_MESSAGE} WHERE m.id = ?`).bind(id).first<MessageRow>();
  if (!row) return null;
  const reactions = await reactionsFor(db, [id]);
  return mapRow(row, reactions.get(id) ?? []);
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
