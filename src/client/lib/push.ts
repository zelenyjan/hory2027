import { api } from './api';

export type PushStatus =
  | 'unsupported'
  | 'unavailable'
  | 'needs-install'
  | 'denied'
  | 'default'
  | 'subscribed'
  | 'unsubscribed';

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone/iPad — Web Push only works from a Home Screen app, not a Safari tab. */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** True when running as an installed PWA (Home Screen / “installed app”). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia('(display-mode: standalone)').matches;
  const legacy = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || legacy;
}

export function deniedHelpText(): string {
  if (isAppleTouchDevice()) {
    return [
      'iOS blocked notifications for this app.',
      'Open Settings → Notifications → Hory, turn Allow Notifications on.',
      'If Hory is not listed, delete the Home Screen icon and add the site again (Share → Add to Home Screen), then open it from there and retry.',
    ].join(' ');
  }
  return [
    'Notifications are blocked for this site.',
    'Click the lock / tune icon in the address bar → Site settings → Notifications → Allow, then try again.',
  ].join(' ');
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';

  // Safari on iOS reports “denied” from a browser tab even before the user is asked.
  if (isAppleTouchDevice() && !isStandaloneDisplay()) return 'needs-install';

  if (Notification.permission === 'denied') return 'denied';

  const { key } = await api.pushKey();
  if (!key) return 'unavailable';

  const registration = await ensureServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) return 'subscribed';
  return Notification.permission === 'granted' ? 'unsubscribed' : 'default';
}

export async function enablePush(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  if (isAppleTouchDevice() && !isStandaloneDisplay()) return 'needs-install';

  const { key } = await api.pushKey();
  if (!key) return 'unavailable';

  // Must stay inside the click handler — browsers (esp. Safari) drop prompts without a gesture.
  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') {
    if (isAppleTouchDevice() && !isStandaloneDisplay()) return 'needs-install';
    return permission === 'denied' ? 'denied' : 'default';
  }

  const registration = await ensureServiceWorker();
  if (!registration) return 'unsupported';
  await navigator.serviceWorker.ready;

  // Always mint a fresh subscription against the current server key. Reusing an
  // old PushSubscription after a VAPID rotation makes Apple reject with
  // VapidPkHashMismatch, and the browser will happily keep serving the stale one.
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await api.pushUnsubscribe(existing.endpoint).catch(() => {});
    await existing.unsubscribe().catch(() => {});
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
  } catch (error) {
    // Common on iOS when the page is not the installed Home Screen app.
    if (isAppleTouchDevice() && !isStandaloneDisplay()) return 'needs-install';
    throw error;
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Push subscription incomplete');
  }

  await api.pushSubscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return 'subscribed';
}

export async function disablePush(): Promise<PushStatus> {
  const registration = await navigator.serviceWorker?.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
  return 'unsubscribed';
}

export async function testPush(): Promise<number> {
  return api.pushTest();
}
