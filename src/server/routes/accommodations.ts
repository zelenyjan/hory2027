import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createAccommodationSchema,
  createCommentSchema,
  rateAccommodationSchema,
} from '../../shared/schemas';
import {
  getAccommodation,
  listAccommodations,
  listComments,
  listLocations,
  providerFromUrl,
} from '../db/accommodations';
import { broadcast, intParam, parseBody } from '../middleware';
import type { AppEnv } from '../types';

export const accommodationRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const location = c.req.query('location')?.trim();
    return c.json(await listAccommodations(c.env.DB, c.get('user').id, location || undefined));
  })

  .get('/locations', async (c) => c.json(await listLocations(c.env.DB)))

  .post('/', async (c) => {
    const { url, priceCzk, location, comment } = await parseBody(c, createAccommodationSchema);
    const user = c.get('user');

    // Reuse the existing spelling of a location so "Sölden"/"sölden" stay one bucket.
    const known = await c.env.DB.prepare(
      'SELECT location FROM accommodations WHERE location = ? COLLATE NOCASE LIMIT 1',
    )
      .bind(location)
      .first<{ location: string }>();

    const row = await c.env.DB.prepare(
      `INSERT INTO accommodations (user_id, url, provider, location, total_price_czk, comment)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        user.id,
        url,
        providerFromUrl(url),
        known?.location ?? location,
        priceCzk,
        comment || null,
      )
      .first<{ id: number }>();

    broadcast(c, { type: 'accommodation.created', payload: { id: row!.id } });
    return c.json((await getAccommodation(c.env.DB, row!.id, user.id))!, 201);
  })

  .get('/:id', async (c) => {
    const accommodation = await getAccommodation(c.env.DB, intParam(c, 'id'), c.get('user').id);
    if (!accommodation) throw new HTTPException(404, { message: 'Not found' });
    return c.json(accommodation);
  })

  .delete('/:id', async (c) => {
    const id = intParam(c, 'id');
    const user = c.get('user');
    const row = await c.env.DB.prepare('SELECT user_id AS userId FROM accommodations WHERE id = ?')
      .bind(id)
      .first<{ userId: number }>();
    if (!row) throw new HTTPException(404, { message: 'Not found' });
    if (row.userId !== user.id && user.role !== 'admin') {
      throw new HTTPException(403, { message: 'Not allowed' });
    }

    await c.env.DB.prepare('DELETE FROM accommodations WHERE id = ?').bind(id).run();
    broadcast(c, { type: 'accommodation.deleted', payload: { id } });
    return c.json({ ok: true });
  })

  .put('/:id/rating', async (c) => {
    const id = intParam(c, 'id');
    const { value } = await parseBody(c, rateAccommodationSchema);
    const user = c.get('user');

    const exists = await c.env.DB.prepare('SELECT 1 FROM accommodations WHERE id = ?')
      .bind(id)
      .first();
    if (!exists) throw new HTTPException(404, { message: 'Not found' });

    if (value === 0) {
      await c.env.DB.prepare(
        'DELETE FROM accommodation_ratings WHERE accommodation_id = ? AND user_id = ?',
      )
        .bind(id, user.id)
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO accommodation_ratings (accommodation_id, user_id, value) VALUES (?, ?, ?)
         ON CONFLICT (accommodation_id, user_id) DO UPDATE SET value = excluded.value`,
      )
        .bind(id, user.id, value)
        .run();
    }

    broadcast(c, { type: 'accommodation.rated', payload: { id } });
    return c.json((await getAccommodation(c.env.DB, id, user.id))!);
  })

  .get('/:id/comments', async (c) => c.json(await listComments(c.env.DB, intParam(c, 'id'))))

  .post('/:id/comments', async (c) => {
    const accommodationId = intParam(c, 'id');
    const { body } = await parseBody(c, createCommentSchema);
    const user = c.get('user');

    const exists = await c.env.DB.prepare('SELECT 1 FROM accommodations WHERE id = ?')
      .bind(accommodationId)
      .first();
    if (!exists) throw new HTTPException(404, { message: 'Not found' });

    await c.env.DB.prepare(
      'INSERT INTO accommodation_comments (accommodation_id, user_id, body) VALUES (?, ?, ?)',
    )
      .bind(accommodationId, user.id, body)
      .run();

    broadcast(c, { type: 'comment.created', payload: { accommodationId } });
    return c.json(await listComments(c.env.DB, accommodationId), 201);
  });

export const commentRoutes = new Hono<AppEnv>().delete('/:id', async (c) => {
  const id = intParam(c, 'id');
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT user_id AS userId, accommodation_id AS accommodationId FROM accommodation_comments WHERE id = ?',
  )
    .bind(id)
    .first<{ userId: number; accommodationId: number }>();
  if (!row) throw new HTTPException(404, { message: 'Not found' });
  if (row.userId !== user.id && user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Not allowed' });
  }

  await c.env.DB.prepare(
    "UPDATE accommodation_comments SET body = '', deleted_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();

  broadcast(c, { type: 'comment.deleted', payload: { accommodationId: row.accommodationId } });
  return c.json({ ok: true });
});
