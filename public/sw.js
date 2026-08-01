/// <reference lib="webworker" />
// Service worker for the installed app: offline shell, push notifications, app badge.
// Plain JS on purpose — it is served straight from /public, outside the Vite build.

const CACHE = 'hory-shell-v2';
const APP_ICON = '/icons/icon-192.png';
const BADGE_ICON = '/icons/badge-96.png';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', APP_ICON]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Trip data must never be served stale, and /join is a one-shot redirect.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/join/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          // Every route returns the same SPA document, so one cached copy covers them all.
          cache.put('/', fresh.clone());
          return fresh;
        } catch {
          return (await caches.match('/')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Vite fingerprints these, so a hit is always the right file.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) (await caches.open(CACHE)).put(request, fresh.clone());
        return fresh;
      })(),
    );
  }
});

async function setBadge(count) {
  if (typeof count !== 'number' || !('setAppBadge' in self.navigator)) return;
  try {
    if (count > 0) await self.navigator.setAppBadge(count);
    else await self.navigator.clearAppBadge();
  } catch {
    /* badges are a nice-to-have */
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    (async () => {
      // Badge always updates; the tray alert is skipped when the app is already in front.
      await setBadge(data.badgeCount);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((client) => client.focused)) return;

      await self.registration.showNotification(data.title ?? 'Hory 2027', {
        body: data.body ?? '',
        tag: data.tag ?? 'hory',
        renotify: true,
        icon: APP_ICON,
        badge: BADGE_ICON,
        data: { url: data.url ?? '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The page owns the badge while it is open; the worker just relays what it computed.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'badge') event.waitUntil(setBadge(event.data.count));
});
