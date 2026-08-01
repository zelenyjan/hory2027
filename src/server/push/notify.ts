import type { Context } from 'hono';
import { unreadCounts } from '../db/messages';
import type { AppEnv, Bindings } from '../types';
import { isDeadPushStatus, sendPush, type PushSubscriptionRow } from './webpush';

export type Notification = {
  title: string;
  body: string;
  /** In-app route opened when the notification is tapped. */
  url: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag: string;
};

type SubscriptionRow = PushSubscriptionRow & { userId: number };

const BODY_MAX = 140;

export function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > BODY_MAX ? `${flat.slice(0, BODY_MAX - 1)}…` : flat;
}

/** Fire-and-forget: notification delivery must never fail the request that caused it. */
export function notifyOthers(c: Context<AppEnv>, actorId: number, note: Notification): void {
  c.executionCtx.waitUntil(
    deliver(c.env, actorId, note).catch((error) => console.error('push delivery failed', error)),
  );
}

async function deliver(env: Bindings, actorId: number, note: Notification): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

  const { results: subscriptions } = await env.DB.prepare(
    `SELECT s.endpoint, s.p256dh, s.auth, s.user_id AS userId
       FROM push_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE u.active = 1 AND s.user_id != ?`,
  )
    .bind(actorId)
    .all<SubscriptionRow>();
  if (subscriptions.length === 0) return;

  const unread = await unreadCounts(env.DB);

  const dead = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const result = await sendPush(env, subscription, {
          ...note,
          badgeCount: unread.get(subscription.userId) ?? 0,
        });
        return isDeadPushStatus(result.status, result.reason) ? subscription.endpoint : null;
      } catch (error) {
        console.error('push send threw', error);
        return null;
      }
    }),
  );

  const gone = dead.filter((endpoint): endpoint is string => endpoint !== null);
  if (gone.length > 0) {
    await env.DB.prepare(
      `DELETE FROM push_subscriptions WHERE endpoint IN (${gone.map(() => '?').join(',')})`,
    )
      .bind(...gone)
      .run();
  }
}
