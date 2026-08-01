// Renders the app icons from one SVG using the Chrome that puppeteer-core drives.
// Run after changing the artwork: node scripts/icons.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('../public/icons/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const SNOWFLAKE = `
  <g stroke="white" stroke-width="34" stroke-linecap="round">
    <path d="M256 60 V452 M86 158 L426 354 M86 354 L426 158" />
    <path d="M256 130 l-52 -52 M256 130 l52 -52 M256 382 l-52 52 M256 382 l52 52" />
    <path d="M146 194 l-71 -6 M146 194 l-20 -69 M366 318 l71 6 M366 318 l20 69" />
    <path d="M146 318 l-71 6 M146 318 l-20 69 M366 194 l71 -6 M366 194 l20 -69" />
  </g>`;

/** Maskable icons lose their corners on Android, so the glyph stays inside the safe circle. */
const appIcon = (scale) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3b6fd4"/>
        <stop offset="1" stop-color="#7b52d8"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${SNOWFLAKE}</g>
  </svg>`;

/** Android status-bar badge: monochrome silhouette on transparency. */
const badgeIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <g transform="translate(256 256) scale(0.92) translate(-256 -256)">${SNOWFLAKE}</g>
  </svg>`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

const render = async (svg, size, file, transparent = false) => {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: `${OUT}${file}`, omitBackground: transparent });
  console.log(`  ${file} (${size}px)`);
};

await render(appIcon(0.78), 512, 'icon-512.png');
await render(appIcon(0.78), 192, 'icon-192.png');
await render(appIcon(0.62), 512, 'icon-maskable-512.png');
await render(appIcon(0.78), 180, 'apple-touch-icon.png');
await render(appIcon(0.78), 32, 'favicon-32.png');
await render(badgeIcon, 96, 'badge-96.png', true);

await browser.close();
