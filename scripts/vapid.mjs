// Generates a VAPID key pair for Web Push. Run once per deployment:
//   node scripts/vapid.mjs
// Put the printed values in .dev.vars locally and in Worker secrets for production.
import { webcrypto as crypto } from 'node:crypto';

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

console.log(`VAPID_PUBLIC_KEY="${b64url(await crypto.subtle.exportKey('raw', pair.publicKey))}"`);
console.log(
  `VAPID_PRIVATE_KEY="${b64url(await crypto.subtle.exportKey('pkcs8', pair.privateKey))}"`,
);
console.log('VAPID_SUBJECT="mailto:admin@hory2027.baby"');
