// Renders the toolbar icon (a smiley with a colon for eyes) to PNGs.
import { chromium } from 'playwright';

const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
    <rect width="128" height="128" rx="30" fill="#5865f2"/>
    <circle cx="46" cy="44" r="12" fill="#fff"/>
    <circle cx="46" cy="84" r="12" fill="#fff"/>
    <path d="M78 26 Q116 64 78 102" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
  </svg>`;

const browser = await chromium.launch({ channel: 'chromium' });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: `extension/icons/icon${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
