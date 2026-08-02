import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createAttendeeSchema,
  reorderAttendeesSchema,
  updateAttendeeSchema,
} from '../../shared/schemas';
import {
  createAttendee,
  deleteAttendee,
  listAttendees,
  reorderAttendees,
  updateAttendeeName,
} from '../db/attendees';
import { broadcast, intParam, parseBody } from '../middleware';
import type { AppEnv } from '../types';

function changed(c: Parameters<typeof broadcast>[0]) {
  broadcast(c, { type: 'attendees.changed', payload: {} });
}

export const attendeeRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await listAttendees(c.env.DB)))

  .post('/', async (c) => {
    const { name } = await parseBody(c, createAttendeeSchema);
    const attendee = await createAttendee(c.env.DB, name);
    changed(c);
    return c.json(attendee, 201);
  })

  .put('/reorder', async (c) => {
    const { ids } = await parseBody(c, reorderAttendeesSchema);
    const attendees = await reorderAttendees(c.env.DB, ids);
    changed(c);
    return c.json(attendees);
  })

  .patch('/:id', async (c) => {
    const id = intParam(c, 'id');
    const { name } = await parseBody(c, updateAttendeeSchema);
    const attendee = await updateAttendeeName(c.env.DB, id, name);
    if (!attendee) throw new HTTPException(404, { message: 'Nenalezeno' });
    changed(c);
    return c.json(attendee);
  })

  .delete('/:id', async (c) => {
    const id = intParam(c, 'id');
    const ok = await deleteAttendee(c.env.DB, id);
    if (!ok) throw new HTTPException(404, { message: 'Nenalezeno' });
    changed(c);
    return c.json({ ok: true });
  });
