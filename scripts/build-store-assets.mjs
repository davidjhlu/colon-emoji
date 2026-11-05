// Renders the store screenshots and promo tile with the real extension running, on a made-up
// chat page. The page is deliberately generic, so it doesn't look like any real product.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionPath = resolve('extension');
const outDir = resolve('store/images');
mkdirSync(outDir, { recursive: true });
const extensionId = [...createHash('sha256').update(extensionPath).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');

const chatPage = `<!doctype html><html><head><meta charset="utf-8"><title>Chat</title><style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; justify-content: flex-end; padding: 48px 180px 56px;
    background: #f3f4f8; font: 26px/1.35 system-ui, -apple-system, sans-serif; color: #1c1e21; }
  .bubble { max-width: 70%; width: fit-content; margin: 8px 0; padding: 14px 22px; border-radius: 24px; background: #fff; }
  .me { align-self: flex-end; background: #5865f2; color: #fff; }
  #box { margin-top: 24px; min-height: 68px; padding: 18px 24px; border-radius: 34px; border: 2px solid #d5d8e2;
    background: #fff; outline: none; }
</style></head><body>
  <div class="bubble">Did you see the game last night?</div>
  <div class="bubble me">Yes!! That ending 🔥🔥</div>
  <div class="bubble">Best one all season 😂</div>
  <div id="box" contenteditable="true"></div>
</body></html>`;

const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(chatPage);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const profile = mkdtempSync(join(tmpdir(), 'colon-emoji-store-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light',
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

// Sample custom emoji, drawn here so no third-party artwork is involved.
const options = await context.newPage();
await options.goto(`chrome-extension://${extensionId}/options/options.html`);
await options.evaluate(async () => {
  const draw = (fill, paint) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d');
    c.fillStyle = fill;
    c.beginPath();
    c.arc(32, 32, 31, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = c.strokeStyle = '#1e1e1e';
    c.lineWidth = 4;
    c.lineCap = 'round';
    paint(c);
    return canvas.toDataURL('image/png');
  };
  const eyes = (c) => {
    c.beginPath();
    c.arc(22, 26, 4, 0, 7);
    c.arc(42, 26, 4, 0, 7);
    c.fill();
  };
  const emoji = {
    party_blob: draw('#fabe28', (c) => {
      eyes(c);
      c.beginPath();
      c.arc(32, 36, 14, 0.2, Math.PI - 0.2);
      c.stroke();
    }),
    party_parrot_blue: draw('#7c8cff', (c) => {
      eyes(c);
      c.beginPath();
      c.moveTo(24, 44);
      c.lineTo(40, 44);
      c.stroke();
    }),
    party_time: draw('#ff8fa3', (c) => {
      eyes(c);
      c.beginPath();
      c.arc(32, 42, 7, 0, 7);
      c.fill();
    }),
  };
  const entries = Object.entries(emoji);
  await chrome.storage.local.set(
    Object.fromEntries(entries.map(([name, dataUrl]) => [`custom:${name}`, { type: 'image/png', dataUrl }])),
  );
  await chrome.storage.local.set({ customNames: entries.map(([name]) => name), consented: true });
});

const page = await context.newPage();

async function chatShot(text, file) {
  await page.goto(url);
  await page.click('#box');
  await page.keyboard.type(text, { delay: 10 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(outDir, file) });
}

await chatShot('that was amazing :sm', '1-autocomplete.png');
await chatShot('so good :par', '2-custom-emoji.png');

await options.reload();
await options.waitForSelector('#list li');
await options.bringToFront();
await options.screenshot({ path: join(outDir, '3-custom-emoji-settings.png') });

const tile = await context.newPage();
await tile.setViewportSize({ width: 440, height: 280 });
await tile.setContent(`<!doctype html><body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:18px;background:#5865f2;color:#fff;font-family:system-ui,-apple-system,sans-serif">
  <div style="font-size:38px;font-weight:700">:emoji</div>
  <div style="padding:12px 22px;border-radius:16px;background:#fff;color:#1c1e21;font-size:26px">:smile: → 😄</div>
  <div style="font-size:17px">Type emoji anywhere on the web</div></body>`);
await tile.screenshot({ path: join(outDir, 'promo-small-440x280.png') });

await context.close();
server.close();
rmSync(profile, { recursive: true, force: true });
process.exit(0);
