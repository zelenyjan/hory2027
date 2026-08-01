import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { TripEvent } from '@shared/events';
import type { Me, Message, MessagePage, MessageRead } from '@shared/types';
import { setAppBadge } from './badge';
import { qk } from './queries';

const PING_INTERVAL_MS = 45_000;
const MAX_BACKOFF_MS = 30_000;

type MessageFeed = InfiniteData<MessagePage, string | null>;

/** Chat is open and in front — ChatPage will mark the message read itself. */
function isReadingChat(): boolean {
  return location.pathname === '/' && document.visibilityState === 'visible';
}

function bumpUnread(queryClient: QueryClient, authorId: number): void {
  const me = queryClient.getQueryData<Me | null>(qk.me);
  if (isReadingChat() || (me && authorId === me.id)) return;

  if (me) {
    const previous = queryClient.getQueryData<{ count: number }>(qk.unread)?.count ?? 0;
    const next = previous + 1;
    queryClient.setQueryData(qk.unread, { count: next });
    setAppBadge(next);
  }
  // Confirm against the server in case we drifted (e.g. after a reconnect gap).
  void queryClient.invalidateQueries({ queryKey: qk.unread });
}

function upsertMessage(feed: MessageFeed | undefined, message: Message): MessageFeed | undefined {
  if (!feed) return feed;
  let replaced = false;
  const pages = feed.pages.map((page) => {
    if (!page.messages.some((m) => m.id === message.id)) return page;
    replaced = true;
    return { ...page, messages: page.messages.map((m) => (m.id === message.id ? message : m)) };
  });
  if (replaced) return { ...feed, pages };

  // Page 0 holds the newest slice, so a brand new message belongs at its end.
  const [newest, ...rest] = pages;
  if (!newest) return feed;
  return {
    ...feed,
    pages: [{ ...newest, messages: [...newest.messages, message] }, ...rest],
  };
}

function applyReaction(
  feed: MessageFeed | undefined,
  event: Extract<TripEvent, { type: 'reaction.toggled' }>['payload'],
): MessageFeed | undefined {
  if (!feed) return feed;
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) => {
        if (message.id !== event.messageId) return message;
        const reactions = message.reactions.map((r) => ({ ...r, users: [...r.users] }));
        const group = reactions.find((r) => r.emoji === event.emoji);

        if (event.added) {
          const user = { userId: event.userId, name: event.userName };
          if (!group) reactions.push({ emoji: event.emoji, users: [user] });
          else if (!group.users.some((u) => u.userId === event.userId)) group.users.push(user);
        } else if (group) {
          group.users = group.users.filter((u) => u.userId !== event.userId);
        }

        return { ...message, reactions: reactions.filter((r) => r.users.length > 0) };
      }),
    })),
  };
}

export function useTripSocket(enabled: boolean): { online: number; connected: boolean } {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(0);
  const [connected, setConnected] = useState(false);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/api/ws`);

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
        // A dropped socket may have missed writes; resync the newest slice.
        void queryClient.invalidateQueries({ queryKey: qk.messages });
        void queryClient.invalidateQueries({ queryKey: qk.reads });
        pingTimer = window.setInterval(() => socket?.send('ping'), PING_INTERVAL_MS);
      };

      socket.onmessage = (raw) => {
        if (raw.data === 'pong') return;
        let event: TripEvent;
        try {
          event = JSON.parse(raw.data as string) as TripEvent;
        } catch {
          return;
        }
        handleEvent(event);
      };

      socket.onclose = () => {
        setConnected(false);
        window.clearInterval(pingTimer);
        if (disposed) return;
        const delay = Math.min(1000 * 2 ** attemptRef.current++, MAX_BACKOFF_MS);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => socket?.close();
    };

    const handleEvent = (event: TripEvent) => {
      switch (event.type) {
        case 'message.created':
        case 'message.updated':
        case 'message.deleted':
          queryClient.setQueryData<MessageFeed>(qk.messages, (feed) =>
            upsertMessage(feed, event.payload),
          );
          if (event.type === 'message.created') {
            bumpUnread(queryClient, event.payload.userId);
          }
          break;
        case 'reaction.toggled':
          queryClient.setQueryData<MessageFeed>(qk.messages, (feed) =>
            applyReaction(feed, event.payload),
          );
          break;
        case 'message.read':
          queryClient.setQueryData<MessageRead[]>(qk.reads, (current) => {
            if (!current) return current;
            // A member invited since this page loaded is not in the roster yet.
            if (!current.some((entry) => entry.userId === event.payload.userId)) {
              return [...current, event.payload];
            }
            return current.map((entry) =>
              entry.userId === event.payload.userId
                ? { ...entry, lastReadMessageId: event.payload.lastReadMessageId }
                : entry,
            );
          });
          break;
        case 'poll.created':
        case 'poll.closed':
        case 'poll.deleted':
        case 'poll.voted':
          void queryClient.invalidateQueries({ queryKey: qk.polls });
          break;
        case 'accommodation.created':
        case 'accommodation.deleted':
        case 'accommodation.rated':
          void queryClient.invalidateQueries({ queryKey: ['accommodations'] });
          void queryClient.invalidateQueries({ queryKey: ['accommodation'] });
          void queryClient.invalidateQueries({ queryKey: qk.locations });
          break;
        case 'comment.created':
        case 'comment.deleted':
          void queryClient.invalidateQueries({
            queryKey: qk.comments(event.payload.accommodationId),
          });
          void queryClient.invalidateQueries({ queryKey: ['accommodations'] });
          void queryClient.invalidateQueries({ queryKey: ['accommodation'] });
          break;
        case 'presence':
          setOnline(event.payload.online);
          break;
      }
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pingTimer);
      socket?.close();
    };
  }, [enabled, queryClient]);

  return { online, connected };
}
