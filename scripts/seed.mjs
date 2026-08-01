// Fills a fresh local database with a little demo data so the UI has something to show.
// Usage: pnpm db:migrate:local && pnpm dev, then: node scripts/seed.mjs [baseUrl]
import { ADMIN_NAME, BASE, BOOTSTRAP_PASSWORD } from './local.mjs';

const sessions = new Map();

async function call(as, method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      Origin: BASE,
      'Content-Type': 'application/json',
      ...(sessions.has(as) ? { Cookie: `sid=${sessions.get(as)}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const cookie = response.headers.get('set-cookie')?.match(/sid=([^;]+)/)?.[1];
  if (cookie) sessions.set(as, cookie);

  const text = await response.text();
  const data = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
  if (response.status >= 400) throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  return data;
}

async function signInAsAdmin() {
  const me = await call('admin', 'POST', '/api/auth/login', {
    name: ADMIN_NAME,
    password: BOOTSTRAP_PASSWORD,
  });
  if (me.mustSetPassword) {
    await call('admin', 'POST', '/api/auth/password', { next: BOOTSTRAP_PASSWORD });
  }
  console.log(`signed in as ${ADMIN_NAME} / ${BOOTSTRAP_PASSWORD}`);
}

async function addMember(name) {
  const { inviteUrl } = await call('admin', 'POST', '/api/admin/users', { name });
  await call(name, 'GET', new URL(inviteUrl).pathname);
  console.log(`${name}: ${inviteUrl}`);
  return name;
}

await signInAsAdmin();
const petra = await addMember('Petra');
const tomas = await addMember('Tomáš');

const first = await call('admin', 'POST', '/api/messages', {
  body: 'Tak co, jedeme letos na hory? Hodil jsem sem par tipu do Places.',
});
await call(petra, 'POST', '/api/messages', { body: 'Jasně že jedeme 🎿' });
await call(tomas, 'POST', '/api/messages', {
  body: 'Mně sedí spíš únor, leden mám plný.',
  quotedMessageId: first.id,
});
await call(petra, 'PUT', `/api/messages/${first.id}/reactions`, { emoji: '👍' });

const poll = await call('admin', 'POST', '/api/polls', {
  question: 'Kdy vyrazíme?',
  options: ['Leden', 'Únor', 'Březen'],
  multiChoice: false,
});
await call(petra, 'POST', `/api/polls/${poll.id}/votes`, { optionIds: [poll.options[1].id] });
await call(tomas, 'POST', `/api/polls/${poll.id}/votes`, { optionIds: [poll.options[1].id] });

const solden = await call('admin', 'POST', '/api/accommodations', {
  url: 'https://www.booking.com/hotel/at/apart-soelden.html',
  priceCzk: 48000,
  location: 'Sölden',
  comment: '6 lůžek, 300 m k vleku, kuchyň, k dispozici 7.–14. 2.',
});
await call(tomas, 'POST', '/api/accommodations', {
  url: 'https://www.airbnb.cz/rooms/12345678',
  priceCzk: 52000,
  location: 'sölden',
  comment: 'Dražší, ale sauna a parkování v ceně.',
});
await call(petra, 'POST', '/api/accommodations', {
  url: 'https://www.booking.com/hotel/it/livigno-chalet.html',
  priceCzk: 41500,
  location: 'Livigno',
});

await call(petra, 'PUT', `/api/accommodations/${solden.id}/rating`, { value: 1 });
await call(tomas, 'PUT', `/api/accommodations/${solden.id}/rating`, { value: 1 });
await call(petra, 'POST', `/api/accommodations/${solden.id}/comments`, {
  body: 'Vypadá skvěle, ale ověřil někdo parkování?',
});

console.log('\nSeeded: 3 users, 3 messages, 1 poll, 3 places, 1 comment.');
