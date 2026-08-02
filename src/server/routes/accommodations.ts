import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { emojify } from '../../shared/emoticons';
import { extractMentionIds } from '../../shared/mentions';
import { displayName } from '../../shared/names';
import {
  createAccommodationSchema,
  createCommentSchema,
  rateAccommodationSchema,
} from '../../shared/schemas';
import { listActiveMembers } from '../db/messages';
import {
  getAccommodation,
  getAccommodationImageKey,
  listAccommodations,
  listComments,
  listLocations,
  providerFromUrl,
  replaceCommentMentions,
} from '../db/accommodations';
import { broadcast, intParam, parseBody } from '../middleware';
import { deleteAccommodationMedia, enrichAccommodationOg } from '../og/enrich';
import { notifyOthers, preview } from '../push/notify';
import type { AppEnv } from '../types';

export const accommodationRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const location = c.req.query('location')?.trim();
    return c.json(await listAccommodations(c.env.DB, c.get('user').id, location || undefined));
  })

  .get('/locations', async (c) => c.json(await listLocations(c.env.DB)))

  .post('/', async (c) => {
    const { url, title, priceCzk, location, comment } = await parseBody(
      c,
      createAccommodationSchema,
    );
    const user = c.get('user');

    // Reuse the existing spelling of a location so "Sölden"/"sölden" stay one bucket.
    const known = await c.env.DB.prepare(
      'SELECT location FROM accommodations WHERE location = ? COLLATE NOCASE LIMIT 1',
    )
      .bind(location)
      .first<{ location: string }>();

    const row = await c.env.DB.prepare(
      `INSERT INTO accommodations (user_id, url, title, provider, location, total_price_czk, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        user.id,
        url,
        title || null,
        providerFromUrl(url),
        known?.location ?? location,
        priceCzk,
        comment || null,
      )
      .first<{ id: number }>();

    const id = row!.id;
    broadcast(c, { type: 'accommodation.created', payload: { id } });

    // OG scrape + R2 image after the response — Booking/Airbnb often block; failures are fine.
    c.executionCtx.waitUntil(
      enrichAccommodationOg(c.env, id, url)
        .then((changed) => {
          if (changed) broadcast(c, { type: 'accommodation.updated', payload: { id } });
        })
        .catch(() => {}),
    );

    const place = (await getAccommodation(c.env.DB, id, user.id))!;
    notifyOthers(
      c,
      user.id,
      {
        title: `${displayName(user)}: nové místo`,
        body: preview([place.title ?? place.ogTitle, place.location].filter(Boolean).join(' · ')),
        url: `/places/${place.id}`,
        tag: `place-${place.id}`,
      },
      { kind: 'place' },
    );
    return c.json(place, 201);
  })

  .get('/:id/image', async (c) => {
    const id = intParam(c, 'id');
    const key = await getAccommodationImageKey(c.env.DB, id);
    if (!key) throw new HTTPException(404, { message: 'Nenalezeno' });

    const object = await c.env.MEDIA.get(key);
    if (!object) throw new HTTPException(404, { message: 'Nenalezeno' });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, max-age=86400');
    return new Response(object.body, { headers });
  })

  .get('/:id', async (c) => {
    const accommodation = await getAccommodation(c.env.DB, intParam(c, 'id'), c.get('user').id);
    if (!accommodation) throw new HTTPException(404, { message: 'Nenalezeno' });
    return c.json(accommodation);
  })

  .delete('/:id', async (c) => {
    const id = intParam(c, 'id');
    const user = c.get('user');
    const row = await c.env.DB.prepare(
      'SELECT user_id AS userId, og_image_key AS ogImageKey FROM accommodations WHERE id = ?',
    )
      .bind(id)
      .first<{ userId: number; ogImageKey: string | null }>();
    if (!row) throw new HTTPException(404, { message: 'Nenalezeno' });
    if (row.userId !== user.id && user.role !== 'admin') {
      throw new HTTPException(403, { message: 'Nemáš oprávnění' });
    }

    await c.env.DB.prepare('DELETE FROM accommodations WHERE id = ?').bind(id).run();
    c.executionCtx.waitUntil(deleteAccommodationMedia(c.env, row.ogImageKey));
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
    if (!exists) throw new HTTPException(404, { message: 'Nenalezeno' });

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
    if (!exists) throw new HTTPException(404, { message: 'Nenalezeno' });

    const text = emojify(body);
    const row = await c.env.DB.prepare(
      `INSERT INTO accommodation_comments (accommodation_id, user_id, body)
       VALUES (?, ?, ?) RETURNING id`,
    )
      .bind(accommodationId, user.id, text)
      .first<{ id: number }>();

    const members = await listActiveMembers(c.env.DB);
    const mentionIds = extractMentionIds(text, members).filter((uid) => uid !== user.id);
    await replaceCommentMentions(c.env.DB, row!.id, mentionIds);

    broadcast(c, { type: 'comment.created', payload: { accommodationId } });
    if (mentionIds.length > 0) {
      notifyOthers(
        c,
        user.id,
        {
          title: displayName(user),
          body: preview(text),
          url: `/places/${accommodationId}`,
          tag: `comment-${row!.id}`,
        },
        { kind: 'mention', mentionIds },
      );
    }
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
  if (!row) throw new HTTPException(404, { message: 'Nenalezeno' });
  if (row.userId !== user.id && user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Nemáš oprávnění' });
  }

  await c.env.DB.prepare(
    "UPDATE accommodation_comments SET body = '', deleted_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();
  await replaceCommentMentions(c.env.DB, id, []);

  broadcast(c, { type: 'comment.deleted', payload: { accommodationId: row.accommodationId } });
  return c.json({ ok: true });
});
