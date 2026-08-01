import { Hono } from 'hono';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '../../shared/schemas';
import { parseBody, requireAuth } from '../middleware';
import { isDeadPushStatus, sendPush } from '../push/webpush';
import type { AppEnv } from '../types';

export const pushRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/key', (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? null }))

  .post('/subscribe', async (c) => {
    const { endpoint, keys } = await parseBody(c, pushSubscribeSchema);
    // The same endpoint can be re-registered by another member on a shared device.
    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE
          SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(endpoint, c.get('user').id, keys.p256dh, keys.auth)
      .run();
    return c.json({ ok: true });
  })

  .post('/unsubscribe', async (c) => {
    const { endpoint } = await parseBody(c, pushUnsubscribeSchema);
    await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .bind(endpoint, c.get('user').id)
      .run();
    return c.json({ ok: true });
  })

  /** Sends a notification to the caller's own devices, for checking the setup works. */
  .post('/test', async (c) => {
    const { results } = await c.env.DB.prepare(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    )
      .bind(c.get('user').id)
      .all<{ endpoint: string; p256dh: string; auth: string }>();

    const outcomes = await Promise.all(
      results.map(async (subscription) => {
        try {
          return await sendPush(c.env, subscription, {
            title: 'Hory 2027',
            body: 'Oznámení fungují. Uvidíme se na sjezdovce.',
            url: '/',
            tag: 'test',
            badgeCount: 1,
          });
        } catch (error) {
          console.error('push test failed', error);
          return { status: 0, reason: 'send failed' };
        }
      }),
    );

    const gone = results
      .filter((_, index) => isDeadPushStatus(outcomes[index]!.status, outcomes[index]!.reason))
      .map((subscription) => subscription.endpoint);
    if (gone.length > 0) {
      await c.env.DB.prepare(
        `DELETE FROM push_subscriptions WHERE endpoint IN (${gone.map(() => '?').join(',')})`,
      )
        .bind(...gone)
        .run();
    }

    return c.json({
      sent: outcomes.filter((o) => o.status >= 200 && o.status < 300).length,
      // Helps diagnose Apple/FCM rejections from the profile "test" button.
      errors: outcomes
        .filter((o) => o.status < 200 || o.status >= 300)
        .map((o) => ({ status: o.status, reason: o.reason ?? null })),
    });
  });
