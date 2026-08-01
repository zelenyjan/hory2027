import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { csrf } from 'hono/csrf';
import { authRoutes, handleJoin } from './routes/auth';
import { messageRoutes } from './routes/messages';
import { pollRoutes } from './routes/polls';
import { accommodationRoutes, commentRoutes } from './routes/accommodations';
import { adminRoutes } from './routes/admin';
import { pushRoutes } from './routes/push';
import { limitLogins, limitWrites, requireAdmin, requireAuth } from './middleware';
import { resolveSession } from './auth/session';
import type { AppEnv } from './types';

export { TripRoom } from './do/TripRoom';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex, nofollow');
});

app.use('/api/*', csrf());

// hono's csrf() only inspects form-ish content types; browsers can't send those
// cross-origin without an Origin header, but this closes the JSON case too.
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && c.req.method !== 'GET' && new URL(origin).host !== new URL(c.req.url).host) {
    throw new HTTPException(403, { message: 'Cross-origin request blocked' });
  }
  await next();
});

const api = new Hono<AppEnv>()
  .use('/auth/login', limitLogins)
  .route('/auth', authRoutes)
  .use('/messages/*', requireAuth, limitWrites)
  .use('/polls/*', requireAuth, limitWrites)
  .use('/accommodations/*', requireAuth, limitWrites)
  .use('/comments/*', requireAuth, limitWrites)
  .use('/push/*', requireAuth, limitWrites)
  .use('/admin/*', requireAuth, requireAdmin, limitWrites)
  .route('/messages', messageRoutes)
  .route('/polls', pollRoutes)
  .route('/accommodations', accommodationRoutes)
  .route('/comments', commentRoutes)
  .route('/push', pushRoutes)
  .route('/admin', adminRoutes);

api.get('/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected WebSocket', 426);
  }
  const user = await resolveSession(c);
  if (!user) return c.text('Unauthorized', 401);

  const stub = c.env.TRIP_ROOM.get(c.env.TRIP_ROOM.idFromName('trip'));
  const url = new URL(c.req.url);
  url.searchParams.set('userId', String(user.id));
  return stub.fetch(new Request(url, c.req.raw));
});

app.route('/api', api);

app.get('/join/:token', handleJoin);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error', err);
  return c.json({ error: 'Something went wrong' }, 500);
});

app.notFound(async (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  return c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), c.req.raw));
});

export default app;
