import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { displayName } from '../../shared/names';
import { createPinLinkSchema, PIN_FILE_MAX_BYTES, TITLE_MAX } from '../../shared/schemas';
import { getPin, getPinStorage, listPins } from '../db/pins';
import { broadcast, intParam, parseBody } from '../middleware';
import { notifyOthers, preview } from '../push/notify';
import type { AppEnv } from '../types';

function safeFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'soubor';
  return base.slice(0, 180);
}

function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] ?? 'bin';
}

export const pinRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await listPins(c.env.DB)))

  .post('/link', async (c) => {
    const { title, url } = await parseBody(c, createPinLinkSchema);
    const user = c.get('user');

    const row = await c.env.DB.prepare(
      `INSERT INTO pins (user_id, kind, title, url) VALUES (?, 'link', ?, ?) RETURNING id`,
    )
      .bind(user.id, title, url)
      .first<{ id: number }>();

    broadcast(c, { type: 'pin.created', payload: { id: row!.id } });
    const pin = (await getPin(c.env.DB, row!.id))!;
    notifyOthers(
      c,
      user.id,
      {
        title: `${displayName(user)}: nový odkaz`,
        body: preview(title),
        url: '/links',
        tag: `pin-${pin.id}`,
      },
      { kind: 'link' },
    );
    return c.json(pin, 201);
  })

  .post('/file', async (c) => {
    const user = c.get('user');
    const body = await c.req.parseBody({ all: false });
    const titleRaw = typeof body.title === 'string' ? body.title.trim() : '';
    const file = body.file;

    if (!titleRaw || titleRaw.length > TITLE_MAX) {
      throw new HTTPException(400, { message: 'Zadej název (max. 160 znaků)' });
    }
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: 'Vyber soubor' });
    }
    if (file.size <= 0) {
      throw new HTTPException(400, { message: 'Soubor je prázdný' });
    }
    if (file.size > PIN_FILE_MAX_BYTES) {
      throw new HTTPException(400, {
        message: `Soubor je moc velký (max. ${Math.floor(PIN_FILE_MAX_BYTES / 1_000_000)} MB)`,
      });
    }

    const fileName = safeFileName(file.name || 'soubor');
    const contentType = (file.type || 'application/octet-stream').slice(0, 200);
    const ext = extensionOf(fileName);

    const row = await c.env.DB.prepare(
      `INSERT INTO pins (user_id, kind, title, file_key, file_name, content_type, byte_size)
       VALUES (?, 'file', ?, 'pending', ?, ?, ?) RETURNING id`,
    )
      .bind(user.id, titleRaw, fileName, contentType, file.size)
      .first<{ id: number }>();

    const id = row!.id;
    const fileKey = `pins/${id}/${crypto.randomUUID()}.${ext}`;

    try {
      await c.env.MEDIA.put(fileKey, await file.arrayBuffer(), {
        httpMetadata: {
          contentType,
          contentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
        },
        customMetadata: { originalName: fileName.slice(0, 200) },
      });
      await c.env.DB.prepare('UPDATE pins SET file_key = ? WHERE id = ?').bind(fileKey, id).run();
    } catch (err) {
      await c.env.DB.prepare('DELETE FROM pins WHERE id = ?').bind(id).run();
      await c.env.MEDIA.delete(fileKey).catch(() => {});
      console.error('Pin file upload failed', err);
      throw new HTTPException(500, { message: 'Nahrání souboru selhalo' });
    }

    broadcast(c, { type: 'pin.created', payload: { id } });
    const pin = (await getPin(c.env.DB, id))!;
    notifyOthers(
      c,
      user.id,
      {
        title: `${displayName(user)}: nový soubor`,
        body: preview(titleRaw),
        url: '/links',
        tag: `pin-${pin.id}`,
      },
      { kind: 'link' },
    );
    return c.json(pin, 201);
  })

  .get('/:id/file', async (c) => {
    const id = intParam(c, 'id');
    const stored = await getPinStorage(c.env.DB, id);
    if (!stored || stored.kind !== 'file' || !stored.fileKey || stored.fileKey === 'pending') {
      throw new HTTPException(404, { message: 'Nenalezeno' });
    }

    const object = await c.env.MEDIA.get(stored.fileKey);
    if (!object) throw new HTTPException(404, { message: 'Nenalezeno' });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, max-age=3600');
    if (!headers.has('Content-Disposition')) {
      const name = (stored.fileName ?? 'soubor').replace(/"/g, '');
      headers.set('Content-Disposition', `attachment; filename="${name}"`);
    }
    return new Response(object.body, { headers });
  })

  .delete('/:id', async (c) => {
    const id = intParam(c, 'id');
    const user = c.get('user');
    const stored = await getPinStorage(c.env.DB, id);
    if (!stored) throw new HTTPException(404, { message: 'Nenalezeno' });
    if (stored.userId !== user.id && user.role !== 'admin') {
      throw new HTTPException(403, { message: 'Nemáš oprávnění' });
    }

    await c.env.DB.prepare('DELETE FROM pins WHERE id = ?').bind(id).run();
    if (stored.fileKey && stored.fileKey !== 'pending') {
      c.executionCtx.waitUntil(c.env.MEDIA.delete(stored.fileKey).catch(() => {}));
    }
    broadcast(c, { type: 'pin.deleted', payload: { id } });
    return c.json({ ok: true });
  });
