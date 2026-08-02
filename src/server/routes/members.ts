import { Hono } from 'hono';
import { listActiveMembers } from '../db/messages';
import type { AppEnv } from '../types';

export const memberRoutes = new Hono<AppEnv>().get('/', async (c) =>
  c.json(await listActiveMembers(c.env.DB)),
);
