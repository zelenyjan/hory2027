import type { Attendee } from '../../shared/types';

export async function listAttendees(db: D1Database): Promise<Attendee[]> {
  const { results } = await db
    .prepare('SELECT id, name, position FROM attendees ORDER BY position ASC, id ASC')
    .all<Attendee>();
  return results;
}

export async function getAttendee(db: D1Database, id: number): Promise<Attendee | null> {
  return db
    .prepare('SELECT id, name, position FROM attendees WHERE id = ?')
    .bind(id)
    .first<Attendee>();
}

export async function createAttendee(db: D1Database, name: string): Promise<Attendee> {
  const row = await db
    .prepare(
      `INSERT INTO attendees (name, position)
       VALUES (?, COALESCE((SELECT MAX(position) + 1 FROM attendees), 0))
       RETURNING id, name, position`,
    )
    .bind(name)
    .first<Attendee>();
  return row!;
}

export async function updateAttendeeName(
  db: D1Database,
  id: number,
  name: string,
): Promise<Attendee | null> {
  await db.prepare('UPDATE attendees SET name = ? WHERE id = ?').bind(name, id).run();
  return getAttendee(db, id);
}

export async function deleteAttendee(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM attendees WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

/** Rewrite positions to match the given id order (0…n-1). Unknown ids are ignored. */
export async function reorderAttendees(db: D1Database, ids: number[]): Promise<Attendee[]> {
  const existing = await listAttendees(db);
  const known = new Set(existing.map((a) => a.id));
  const ordered = ids.filter((id) => known.has(id));
  const missing = existing.map((a) => a.id).filter((id) => !ordered.includes(id));
  const finalIds = [...ordered, ...missing];

  if (finalIds.length > 0) {
    await db.batch(
      finalIds.map((id, position) =>
        db.prepare('UPDATE attendees SET position = ? WHERE id = ?').bind(position, id),
      ),
    );
  }
  return listAttendees(db);
}
