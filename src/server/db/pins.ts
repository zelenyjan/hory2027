import type { Pin } from '../../shared/types';
import { userDisplaySql } from './userDisplay';

type PinRow = {
  id: number;
  userId: number;
  userName: string;
  kind: 'link' | 'file';
  title: string;
  url: string | null;
  fileKey: string | null;
  fileName: string | null;
  contentType: string | null;
  byteSize: number | null;
  createdAt: string;
};

const SELECT_PIN = `
  SELECT p.id, p.user_id AS userId, ${userDisplaySql('u')} AS userName, p.kind, p.title, p.url,
         p.file_key AS fileKey, p.file_name AS fileName, p.content_type AS contentType,
         p.byte_size AS byteSize, p.created_at AS createdAt
    FROM pins p JOIN users u ON u.id = p.user_id`;

function toPin(row: PinRow): Pin {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    kind: row.kind,
    title: row.title,
    url: row.url,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    createdAt: row.createdAt,
  };
}

export async function listPins(db: D1Database): Promise<Pin[]> {
  const { results } = await db
    .prepare(`${SELECT_PIN} ORDER BY p.created_at DESC, p.id DESC`)
    .all<PinRow>();
  return results.map(toPin);
}

export async function getPin(db: D1Database, id: number): Promise<Pin | null> {
  const row = await db.prepare(`${SELECT_PIN} WHERE p.id = ?`).bind(id).first<PinRow>();
  return row ? toPin(row) : null;
}

export async function getPinStorage(
  db: D1Database,
  id: number,
): Promise<{
  userId: number;
  kind: 'link' | 'file';
  fileKey: string | null;
  fileName: string | null;
} | null> {
  const row = await db
    .prepare(
      `SELECT user_id AS userId, kind, file_key AS fileKey, file_name AS fileName
         FROM pins WHERE id = ?`,
    )
    .bind(id)
    .first<{
      userId: number;
      kind: 'link' | 'file';
      fileKey: string | null;
      fileName: string | null;
    }>();
  return row ?? null;
}
