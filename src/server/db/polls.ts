import type { Poll } from '../../shared/types';

type PollRow = {
  id: number;
  creatorId: number;
  creatorName: string;
  question: string;
  multiChoice: number;
  closedAt: string | null;
  createdAt: string;
};

const SELECT_POLL = `
  SELECT p.id, p.creator_id AS creatorId, u.name AS creatorName, p.question,
         p.multi_choice AS multiChoice, p.closed_at AS closedAt, p.created_at AS createdAt
    FROM polls p JOIN users u ON u.id = p.creator_id`;

async function attachOptions(db: D1Database, rows: PollRow[]): Promise<Poll[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');

  type OptionRow = { id: number; pollId: number; label: string; position: number };
  type VoteRow = { optionId: number; userId: number; name: string };

  const [optionResult, voteResult] = (await db.batch([
    db
      .prepare(
        `SELECT id, poll_id AS pollId, label, position FROM poll_options
          WHERE poll_id IN (${placeholders}) ORDER BY poll_id, position`,
      )
      .bind(...ids),
    db
      .prepare(
        `SELECT v.option_id AS optionId, v.user_id AS userId, u.name
           FROM poll_votes v JOIN users u ON u.id = v.user_id
          WHERE v.poll_id IN (${placeholders}) ORDER BY u.name`,
      )
      .bind(...ids),
  ])) as [D1Result<OptionRow>, D1Result<VoteRow>];

  const options = optionResult.results;
  const votersByOption = new Map<number, { userId: number; name: string }[]>();
  for (const vote of voteResult.results) {
    const list = votersByOption.get(vote.optionId) ?? [];
    list.push({ userId: vote.userId, name: vote.name });
    votersByOption.set(vote.optionId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    question: row.question,
    multiChoice: row.multiChoice === 1,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    options: options
      .filter((o) => o.pollId === row.id)
      .map((o) => ({
        id: o.id,
        label: o.label,
        position: o.position,
        voters: votersByOption.get(o.id) ?? [],
      })),
  }));
}

export async function listPolls(db: D1Database): Promise<Poll[]> {
  const { results } = await db
    .prepare(`${SELECT_POLL} ORDER BY p.closed_at IS NOT NULL, p.created_at DESC`)
    .all<PollRow>();
  return attachOptions(db, results);
}

export async function getPoll(db: D1Database, id: number): Promise<Poll | null> {
  const row = await db.prepare(`${SELECT_POLL} WHERE p.id = ?`).bind(id).first<PollRow>();
  if (!row) return null;
  return (await attachOptions(db, [row]))[0] ?? null;
}
