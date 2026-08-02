import type {
  Accommodation,
  AccommodationComment,
  LocationCount,
  Provider,
  UserRef,
} from '../../shared/types';

type AccommodationRow = {
  id: number;
  userId: number;
  userName: string;
  url: string;
  title: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageKey: string | null;
  provider: Provider;
  location: string;
  totalPriceCzk: number;
  comment: string | null;
  createdAt: string;
  commentCount: number;
};

const SELECT_ACCOMMODATION = `
  SELECT a.id, a.user_id AS userId, u.name AS userName, a.url, a.title,
         a.og_title AS ogTitle, a.og_description AS ogDescription, a.og_image_key AS ogImageKey,
         a.provider, a.location,
         a.total_price_czk AS totalPriceCzk, a.comment, a.created_at AS createdAt,
         (SELECT COUNT(*) FROM accommodation_comments ac
           WHERE ac.accommodation_id = a.id AND ac.deleted_at IS NULL) AS commentCount
    FROM accommodations a JOIN users u ON u.id = a.user_id`;

export function providerFromUrl(rawUrl: string): Provider {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (host === 'booking.com' || host.endsWith('.booking.com')) return 'booking';
  if (host === 'airbnb.com' || /(^|\.)airbnb\.[a-z.]+$/.test(host)) return 'airbnb';
  return 'other';
}

async function attachRatings(
  db: D1Database,
  rows: AccommodationRow[],
  viewerId: number,
): Promise<Accommodation[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');

  const { results } = await db
    .prepare(
      `SELECT r.accommodation_id AS accommodationId, r.user_id AS userId, u.name, r.value
         FROM accommodation_ratings r JOIN users u ON u.id = r.user_id
        WHERE r.accommodation_id IN (${placeholders}) ORDER BY u.name`,
    )
    .bind(...ids)
    .all<{ accommodationId: number; userId: number; name: string; value: number }>();

  const up = new Map<number, UserRef[]>();
  const down = new Map<number, UserRef[]>();
  const mine = new Map<number, 1 | -1>();
  for (const r of results) {
    const target = r.value === 1 ? up : down;
    const list = target.get(r.accommodationId) ?? [];
    list.push({ userId: r.userId, name: r.name });
    target.set(r.accommodationId, list);
    if (r.userId === viewerId) mine.set(r.accommodationId, r.value === 1 ? 1 : -1);
  }

  return rows.map((row) => {
    const ups = up.get(row.id) ?? [];
    const downs = down.get(row.id) ?? [];
    return {
      id: row.id,
      userId: row.userId,
      userName: row.userName,
      url: row.url,
      title: row.title,
      ogTitle: row.ogTitle,
      ogDescription: row.ogDescription,
      hasOgImage: Boolean(row.ogImageKey),
      provider: row.provider,
      location: row.location,
      totalPriceCzk: row.totalPriceCzk,
      comment: row.comment,
      createdAt: row.createdAt,
      up: ups,
      down: downs,
      score: ups.length - downs.length,
      myRating: mine.get(row.id) ?? 0,
      commentCount: row.commentCount,
    };
  });
}

export async function listAccommodations(
  db: D1Database,
  viewerId: number,
  location?: string,
): Promise<Accommodation[]> {
  const statement = location
    ? db
        .prepare(`${SELECT_ACCOMMODATION} WHERE a.location = ? ORDER BY a.created_at DESC`)
        .bind(location)
    : db.prepare(`${SELECT_ACCOMMODATION} ORDER BY a.created_at DESC`);
  const { results } = await statement.all<AccommodationRow>();
  return attachRatings(db, results, viewerId);
}

export async function getAccommodation(
  db: D1Database,
  id: number,
  viewerId: number,
): Promise<Accommodation | null> {
  const row = await db
    .prepare(`${SELECT_ACCOMMODATION} WHERE a.id = ?`)
    .bind(id)
    .first<AccommodationRow>();
  if (!row) return null;
  return (await attachRatings(db, [row], viewerId))[0] ?? null;
}

export async function getAccommodationImageKey(
  db: D1Database,
  id: number,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT og_image_key AS ogImageKey FROM accommodations WHERE id = ?')
    .bind(id)
    .first<{ ogImageKey: string | null }>();
  return row?.ogImageKey ?? null;
}

export async function listLocations(db: D1Database): Promise<LocationCount[]> {
  const { results } = await db
    .prepare(
      `SELECT location, COUNT(*) AS count FROM accommodations
        GROUP BY location COLLATE NOCASE ORDER BY count DESC, location COLLATE NOCASE`,
    )
    .all<LocationCount>();
  return results;
}

export async function listComments(
  db: D1Database,
  accommodationId: number,
): Promise<AccommodationComment[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.accommodation_id AS accommodationId, c.user_id AS userId, u.name AS userName,
              c.body, c.created_at AS createdAt, c.deleted_at AS deletedAt
         FROM accommodation_comments c JOIN users u ON u.id = c.user_id
        WHERE c.accommodation_id = ? ORDER BY c.created_at, c.id`,
    )
    .bind(accommodationId)
    .all<{
      id: number;
      accommodationId: number;
      userId: number;
      userName: string;
      body: string;
      createdAt: string;
      deletedAt: string | null;
    }>();

  const ids = results.map((r) => r.id);
  const mentions = await commentMentionsFor(db, ids);

  return results.map((row) => ({
    id: row.id,
    accommodationId: row.accommodationId,
    userId: row.userId,
    userName: row.userName,
    body: row.deletedAt ? '' : row.body,
    createdAt: row.createdAt,
    deleted: row.deletedAt !== null,
    mentions: row.deletedAt ? [] : (mentions.get(row.id) ?? []),
  }));
}

async function commentMentionsFor(
  db: D1Database,
  ids: number[],
): Promise<Map<number, UserRef[]>> {
  const byComment = new Map<number, UserRef[]>();
  if (ids.length === 0) return byComment;

  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT m.comment_id AS commentId, m.user_id AS userId, u.name
         FROM comment_mentions m JOIN users u ON u.id = m.user_id
        WHERE m.comment_id IN (${placeholders})
        ORDER BY u.name`,
    )
    .bind(...ids)
    .all<{ commentId: number; userId: number; name: string }>();

  for (const row of results) {
    const list = byComment.get(row.commentId) ?? [];
    list.push({ userId: row.userId, name: row.name });
    byComment.set(row.commentId, list);
  }
  return byComment;
}

export async function replaceCommentMentions(
  db: D1Database,
  commentId: number,
  userIds: number[],
): Promise<void> {
  await db.prepare('DELETE FROM comment_mentions WHERE comment_id = ?').bind(commentId).run();
  if (userIds.length === 0) return;
  await db.batch(
    userIds.map((userId) =>
      db
        .prepare('INSERT INTO comment_mentions (comment_id, user_id) VALUES (?, ?)')
        .bind(commentId, userId),
    ),
  );
}
