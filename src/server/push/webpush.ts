// Web Push sender: VAPID (RFC 8292) auth plus aes128gcm payload encryption (RFC 8291).
import type { Bindings } from '../types';

const encoder = new TextEncoder();
const RECORD_SIZE = 4096;

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** Body layout: salt | record size | key id length | server public key | ciphertext. */
async function encrypt(
  plaintext: Uint8Array,
  clientPublicKey: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  const serverKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const serverPublicRaw = await crypto.subtle.exportKey('raw', serverKeys.publicKey);
  const serverPublic = new Uint8Array(serverPublicRaw as ArrayBuffer);

  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  // Workers types rename `public` → `$public` on this algorithm; the runtime still wants `public`.
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientKey } as never,
      serverKeys.privateKey,
      256,
    ),
  );

  const ikm = await hkdf(
    shared,
    authSecret,
    concat(encoder.encode('WebPush: info\u0000'), clientPublicKey, serverPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\u0000'), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode('Content-Encoding: nonce\u0000'), 12);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey as BufferSource,
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aesKey,
      concat(plaintext, new Uint8Array([0x02])), // 0x02 = last record
    ),
  );

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = serverPublic.length;
  return concat(header, serverPublic, ciphertext);
}

async function authorization(env: Bindings, endpoint: string): Promise<string> {
  const token = [
    toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))),
    toBase64Url(
      encoder.encode(
        JSON.stringify({
          aud: new URL(endpoint).origin,
          exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
          sub: env.VAPID_SUBJECT,
        }),
      ),
    ),
  ].join('.');

  const key = await crypto.subtle.importKey(
    'pkcs8',
    fromBase64Url(env.VAPID_PRIVATE_KEY) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(token),
  );

  return `vapid t=${token}.${toBase64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

export type PushSendResult = {
  status: number;
  /** Push-service error body when the request was not accepted. */
  reason?: string;
};

/** Resolves with the push service status; 404/410 (and Apple key mismatches) mean the subscription is dead. */
export async function sendPush(
  env: Bindings,
  subscription: PushSubscriptionRow,
  payload: unknown,
): Promise<PushSendResult> {
  const body = await encrypt(
    encoder.encode(JSON.stringify(payload)),
    fromBase64Url(subscription.p256dh),
    fromBase64Url(subscription.auth),
  );

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await authorization(env, subscription.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.byteLength),
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });

  if (response.ok) return { status: response.status };

  const text = await response.text().catch(() => '');
  let reason = text.slice(0, 300);
  try {
    reason = (JSON.parse(text) as { reason?: string }).reason ?? reason;
  } catch {
    /* keep raw text */
  }
  console.error('push rejected', response.status, reason, subscription.endpoint.slice(0, 48));
  return { status: response.status, reason };
}

/** Subscriptions Apple/FCM will never accept again. */
export function isDeadPushStatus(status: number, reason?: string): boolean {
  if (status === 404 || status === 410) return true;
  // Stale VAPID key after rotation — drop so the client can re-subscribe cleanly.
  return status === 400 && /VapidPkHashMismatch|InvalidCryptoKeys/i.test(reason ?? '');
}
