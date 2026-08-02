import type { Context } from 'hono';
import { unreadCounts } from '../db/messages';
import type { AppEnv, Bindings } from '../types';
import { isDeadPushStatus, sendPush, type PushSubscriptionRow } from './webpush';

export type NotifyKind = 'message' | 'mention' | 'vote' | 'place' | 'link';

export type Notification = {
  title: string;
  body: string;
  /** In-app route opened when the notification is tapped. */
  url: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag: string;
};

export type NotifyOptions = {
  kind: NotifyKind;
  /** Users @tagged in a chat message — may receive a mention ping even with messages off. */
  mentionIds?: number[];
};

type SubscriptionRow = PushSubscriptionRow & {
  userId: number;
  notifyMessages: number;
  notifyMentions: number;
  notifyVotes: number;
  notifyPlaces: number;
  notifyLinks: number;
};

const BODY_MAX = 140;

export function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > BODY_MAX ? `${flat.slice(0, BODY_MAX - 1)}…` : flat;
}

/** Fire-and-forget: notification delivery must never fail the request that caused it. */
export function notifyOthers(
  c: Context<AppEnv>,
  actorId: number,
  note: Notification,
  options: NotifyOptions,
): void {
  c.executionCtx.waitUntil(
    deliver(c.env, actorId, note, options).catch((error) =>
      console.error('push delivery failed', error),
    ),
  );
}

function wantsKind(row: SubscriptionRow, kind: NotifyKind, mentioned: boolean): boolean {
  if (kind === 'mention') return mentioned && row.notifyMentions === 1;
  if (kind === 'message') {
    if (mentioned && row.notifyMentions === 1) return true;
    return row.notifyMessages === 1;
  }
  if (kind === 'vote') return row.notifyVotes === 1;
  if (kind === 'place') return row.notifyPlaces === 1;
  if (kind === 'link') return row.notifyLinks === 1;
  return false;
}

async function deliver(
  env: Bindings,
  actorId: number,
  note: Notification,
  options: NotifyOptions,
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

  const { results: subscriptions } = await env.DB.prepare(
    `SELECT s.endpoint, s.p256dh, s.auth, s.user_id AS userId,
            u.notify_messages AS notifyMessages, u.notify_mentions AS notifyMentions,
            u.notify_votes AS notifyVotes, u.notify_places AS notifyPlaces,
            u.notify_links AS notifyLinks
       FROM push_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE u.active = 1 AND s.user_id != ?`,
  )
    .bind(actorId)
    .all<SubscriptionRow>();
  if (subscriptions.length === 0) return;

  const mentionSet = new Set(options.mentionIds ?? []);
  const eligible = subscriptions.filter((row) =>
    wantsKind(row, options.kind, mentionSet.has(row.userId)),
  );
  if (eligible.length === 0) return;

  const unread = await unreadCounts(env.DB);

  const dead = await Promise.all(
    eligible.map(async (subscription) => {
      try {
        const mentioned = mentionSet.has(subscription.userId);
        const asMention =
          mentioned && (options.kind === 'message' || options.kind === 'mention');
        const payload = asMention
          ? {
              ...note,
              title: `${note.title}: zmínka`,
              tag: `mention-${note.tag}`,
            }
          : note;

        const result = await sendPush(env, subscription, {
          ...payload,
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
