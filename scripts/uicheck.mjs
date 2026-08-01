// Ad-hoc UI smoke test: clicks through every view against a running dev server
// that has been populated by scripts/seed.mjs.
//
// Usage: node scripts/uicheck.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { ADMIN_NAME, BASE, BOOTSTRAP_PASSWORD } from './local.mjs';

const PASSWORD = process.env.ADMIN_PASSWORD ?? BOOTSTRAP_PASSWORD;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.env.SHOT_DIR ?? '/tmp/hory-shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

const problems = [];
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) problems.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`  screenshot: ${SHOTS}/${name}.png`);
};
const step = (msg) => console.log(`\n▶ ${msg}`);
const text = () => page.evaluate(() => document.body.innerText);
const clickText = async (selector, label) => {
  const handle = await page.$$(selector).then(async (els) => {
    for (const el of els) {
      const value = await el.evaluate((n) => n.textContent?.trim() ?? '');
      if (value.includes(label)) return el;
    }
    return null;
  });
  if (!handle) throw new Error(`no ${selector} containing "${label}"`);
  await handle.click();
};

step('Login page');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await shot('01-login');

step('Sign in as admin');
await page.type('input[autocomplete="username"]', ADMIN_NAME);
await page.type('input[type="password"]', PASSWORD);
await page.click('button[type="submit"], form button');
await page.waitForFunction(
  () =>
    document.body.innerText.includes('Choose your password') ||
    document.querySelector('nav a[href="/voting"]') !== null,
  { timeout: 10_000 },
);

if ((await text()).includes('Choose your password')) {
  step('Admin password gate');
  await shot('01b-password-gate');
  await page.type('input[type="password"]', PASSWORD);
  await page.click('form button');
}
await page.waitForSelector('nav a[href="/voting"]', { timeout: 10_000 });
await shot('02-chat');

step('Send a message');
await page.type('textarea', 'Ahoj z prohlizece');
await clickText('button', 'Send');
await page.waitForFunction(() => document.body.innerText.includes('Ahoj z prohlizece'), {
  timeout: 10_000,
});
await shot('03-message-sent');

step('Open message actions and react');
const bubbles = await page.$$('div[id^="message-"] div[role="button"]');
await bubbles[0].click();
await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
await shot('04-message-sheet');
await clickText('div[role="dialog"] button', '❤️');
await new Promise((r) => setTimeout(r, 1200));
await shot('05-reaction');

step('Voting tab');
await page.click('nav a[href="/voting"]');
await page.waitForFunction(() => document.body.innerText.includes('Kdy vyrazíme?'), {
  timeout: 10_000,
});
await clickText('button', 'Březen');
await new Promise((r) => setTimeout(r, 1200));
await shot('06-voting');
await clickText('button', 'Who voted?');
await page.waitForSelector('div[role="dialog"]');
await shot('07-who-voted');
await clickText('div[role="dialog"] button', 'Close');

step('Places tab');
await page.click('nav a[href="/places"]');
await page.waitForFunction(() => document.body.innerText.includes('Sölden'), { timeout: 10_000 });
await shot('08-places');
await clickText('button', 'Cheapest');
await new Promise((r) => setTimeout(r, 600));
console.log(`  url after sort: ${page.url()}`);
await clickText('button', 'Sölden (2)');
await new Promise((r) => setTimeout(r, 800));
console.log(`  url after filter: ${page.url()}`);
await shot('09-places-filtered');

step('Place detail + comment');
await clickText('a', '💬');
await page.waitForSelector('textarea', { timeout: 10_000 });
await page.type('textarea', 'Testovaci komentar');
await clickText('button', 'Post');
await page.waitForFunction(() => document.body.innerText.includes('Testovaci komentar'), {
  timeout: 10_000,
});
await shot('10-place-detail');

step('Admin tab');
await page.click('nav a[href="/admin"]');
await page.waitForFunction(() => document.body.innerText.includes('Admin'), { timeout: 10_000 });
await shot('11-admin');
await page.type('input[placeholder="Add someone by name"]', `Katka ${Date.now() % 10000}`);
await clickText('form button', 'Add');
await page.waitForSelector('div[role="dialog"]', { timeout: 10_000 });
await shot('12-invite-link');
const invite = await page.$eval('div[role="dialog"] code', (n) => n.textContent);
console.log(`  invite link: ${invite}`);
await clickText('div[role="dialog"] button', 'Close');

step('Profile sheet + theme switch');
await page.click('header button');
await page.waitForSelector('div[role="dialog"]');
await shot('13-profile');
await clickText('div[role="dialog"] button', 'Night');
await new Promise((r) => setTimeout(r, 400));
await clickText('div[role="dialog"] button', 'Close');
await shot('13b-night-theme');
await page.click('nav a[href="/places"]');
await new Promise((r) => setTimeout(r, 600));
await shot('13c-night-places');
await page.click('header button');
await page.waitForSelector('div[role="dialog"]');
await clickText('div[role="dialog"] button', 'Snow');
await new Promise((r) => setTimeout(r, 300));
await clickText('div[role="dialog"] button', 'Close');

step('Desktop viewport');
await page.setViewport({ width: 1280, height: 900 });
await page.click('nav a[href="/"]');
await new Promise((r) => setTimeout(r, 800));
await shot('14-desktop-chat');

console.log('\n=== console problems ===');
console.log(problems.length ? problems.join('\n') : 'none');
console.log('\n=== final page text (truncated) ===');
console.log((await text()).slice(0, 400));

await browser.close();
