// Captures real About-page screenshots from a running local app.
// Prerequisites: `pnpm dev` (and preferably `pnpm seed` once).
// Usage: node scripts/about-shots.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { ADMIN_NAME, BASE, BOOTSTRAP_PASSWORD } from './local.mjs';

const PASSWORD = process.env.ADMIN_PASSWORD ?? BOOTSTRAP_PASSWORD;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('../public/about/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

const shot = async (target, file) => {
  const path = `${OUT}${file}`;
  await target.screenshot({ path, type: 'png' });
  console.log(`  ${file}`);
};

const clickLabel = async (target, selector, label) => {
  const els = await target.$$(selector);
  for (const el of els) {
    const value = await el.evaluate((n) => n.textContent?.trim() ?? '');
    if (value.includes(label)) {
      await el.click();
      return;
    }
  }
  throw new Error(`no ${selector} containing "${label}"`);
};

const bodyText = (target) => target.evaluate(() => document.body.innerText);

console.log(`\n▶ Capturing against ${BASE}`);
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.waitForSelector('form');
await shot(page, '01-login.png');

console.log('\n▶ Sign in as admin');
await page.type('input[autocomplete="username"]', ADMIN_NAME);
await page.type('input[type="password"]', PASSWORD);
await page.click('button[type="submit"], form button');
await page.waitForFunction(
  () =>
    document.body.innerText.includes('Zvol si heslo') ||
    document.querySelector('nav a[href="/voting"]') !== null,
  { timeout: 15_000 },
);

if ((await bodyText(page)).includes('Zvol si heslo')) {
  await page.type('input[type="password"]', PASSWORD);
  await page.click('form button');
}
await page.waitForSelector('nav a[href="/admin"]', { timeout: 15_000 });

console.log('\n▶ Create invite (Admin sheet)');
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
await page.waitForSelector('input[placeholder="Přidej někoho jménem"]');
const guestName = `Demo ${Date.now() % 10000}`;
await page.type('input[placeholder="Přidej někoho jménem"]', guestName);
await clickLabel(page, 'form button', 'Přidat');
await page.waitForSelector('div[role="dialog"] code', { timeout: 10_000 });
const inviteUrl = await page.$eval('div[role="dialog"] code', (n) => n.textContent?.trim() ?? '');
if (!inviteUrl) throw new Error('invite url missing');
// Show the production host in the About shot (local join still uses the real URL).
await page.$eval('div[role="dialog"] code', (node) => {
  node.textContent = (node.textContent ?? '').replace(/^https?:\/\/[^/]+/, 'https://hory2027.baby');
});
await shot(page, '02-invite-link.png');
await clickLabel(page, 'div[role="dialog"] button', 'Zavřít');

console.log('\n▶ Join as invited member');
const guest = await browser.newPage();
await guest.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await guest.goto(inviteUrl, { waitUntil: 'networkidle0' });
await guest.waitForSelector('nav a[href="/voting"]', { timeout: 15_000 });

console.log('\n▶ Profile → Nastavit heslo');
await guest.click('header button[aria-label="Tvůj profil"]');
await guest.waitForSelector('div[role="dialog"]');
await guest.waitForFunction(() => document.body.innerText.includes('Nastavit heslo'), {
  timeout: 5_000,
});
await guest.evaluate(() => {
  const dialog = document.querySelector('div[role="dialog"]');
  const heading = [...(dialog?.querySelectorAll('h3') ?? [])].find((h) =>
    h.textContent?.includes('Nastavit heslo'),
  );
  heading?.scrollIntoView({ block: 'center' });
});
await new Promise((r) => setTimeout(r, 400));
await shot(guest, '03-set-password.png');

const guestPassword = `HoryDemo-${Date.now() % 100000}x`;
await guest.type('div[role="dialog"] input[autocomplete="new-password"]', guestPassword);
await clickLabel(guest, 'div[role="dialog"] button', 'Uložit heslo');
await guest.waitForFunction(() => document.body.innerText.includes('Heslo uloženo'), {
  timeout: 10_000,
});

console.log('\n▶ Profile → Změnit heslo');
await clickLabel(guest, 'div[role="dialog"] button', 'Zavřít');
// Reload so the profile sheet remounts without the leftover „Heslo uloženo.“ banner.
await guest.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await guest.waitForSelector('header button[aria-label="Tvůj profil"]', { timeout: 10_000 });
await guest.click('header button[aria-label="Tvůj profil"]');
await guest.waitForSelector('div[role="dialog"]');
await guest.waitForFunction(() => document.body.innerText.includes('Změnit heslo'), {
  timeout: 5_000,
});
await guest.evaluate(() => {
  const dialog = document.querySelector('div[role="dialog"]');
  const heading = [...(dialog?.querySelectorAll('h3') ?? [])].find((h) =>
    h.textContent?.includes('Změnit heslo'),
  );
  heading?.scrollIntoView({ block: 'center' });
});
await new Promise((r) => setTimeout(r, 400));
await shot(guest, '04-change-password.png');

await guest.close();
await browser.close();
console.log(`\nWrote real screenshots to ${OUT}`);
