// Loads the real extension into Chromium and types real keystrokes into real editors.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, '../extension');
const outDir = join(here, '.build');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'fixture/app.jsx')],
  bundle: true,
  outfile: join(outDir, 'app.js'),
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'silent',
});

const server = createServer((req, res) => {
  const file = req.url.startsWith('/app.js') ? join(outDir, 'app.js') : join(here, 'fixture/index.html');
  res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(readFileSync(file));
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const profile = mkdtempSync(join(tmpdir(), 'colon-emoji-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 800, height: 760 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const menuRows = () =>
  page.evaluate(() =>
    [...(document.querySelector('[data-colon-emoji]')?.shadowRoot.querySelectorAll('.row') ?? [])].map((r) => ({
      text: r.textContent,
      picked: r.classList.contains('picked'),
    })),
  );
const settle = () => page.waitForTimeout(60);

async function fresh(selector) {
  await page.goto(url);
  await page.waitForSelector('#react');
  await page.click(selector);
}

async function type(text) {
  await page.keyboard.type(text, { delay: 8 });
  await settle();
}

async function press(key) {
  await page.keyboard.press(key);
  await settle();
}

const chat = () => page.evaluate(() => window.lexicalChat());
const rich = () => page.evaluate(() => window.lexicalRich());
const sent = () => page.evaluate(() => window.sent);
const value = (selector) => page.inputValue(selector);

const tests = {
  async 'textarea: a typed closing colon converts'() {
    await fresh('#plain');
    await type('hello :smile: there');
    assert.equal(await value('#plain'), 'hello 😄 there');
  },
  async 'textarea: Enter picks the top result without a newline'() {
    await fresh('#plain');
    await type(':sm');
    assert.ok((await menuRows())[0].picked);
    await press('Enter');
    assert.equal(await value('#plain'), '😄');
    assert.equal((await menuRows()).length, 0);
  },
  async 'textarea: arrows move the selection and Tab inserts it'() {
    await fresh('#plain');
    await type(':sm');
    await press('ArrowDown');
    assert.ok((await menuRows())[1].picked);
    await press('Tab');
    assert.equal(await value('#plain'), '😏');
  },
  async 'textarea: undo restores the shortcode'() {
    await fresh('#plain');
    await type(':smile:');
    assert.equal(await value('#plain'), '😄');
    await press('ControlOrMeta+z');
    assert.equal(await value('#plain'), ':smile:');
  },
  async 'textarea: Esc dismisses until a new shortcode starts'() {
    await fresh('#plain');
    await type(':sm');
    await press('Escape');
    assert.equal((await menuRows()).length, 0);
    await type('i');
    assert.equal((await menuRows()).length, 0);
    await type(' :fi');
    assert.ok((await menuRows()).length > 0);
  },
  async 'textarea: clicking a row inserts it and keeps focus'() {
    await fresh('#plain');
    await type(':sm');
    const box = await page.evaluate(() => {
      const r = document.querySelector('[data-colon-emoji]').shadowRoot.querySelectorAll('.row')[2].getBoundingClientRect();
      return { x: r.x + 20, y: r.y + 8 };
    });
    await page.mouse.click(box.x, box.y);
    await settle();
    await type('!');
    assert.equal(await value('#plain'), '😃!');
  },
  async 'deleting back to a shortcode does not convert it'() {
    await fresh('#plain');
    await type(':smile');
    await press('Escape');
    await type('x');
    await press('Backspace');
    await type(' :nosuchname:x');
    await press('Backspace');
    assert.equal(await value('#plain'), ':smile :nosuchname:');
  },
  async 'ordinary colons never open the menu'() {
    await fresh('#plain');
    for (const text of ['12:30', ' http://x', ' a:b', ' note: ok', ' :)']) {
      await type(text);
      assert.equal((await menuRows()).length, 0, text);
    }
  },
  async 'text input converts and Enter picks'() {
    await fresh('#input');
    await type('hey :fire');
    await press('Enter');
    await type(' ok :tada:');
    assert.equal(await value('#input'), 'hey 🔥 ok 🎉');
  },
  async 'password fields are ignored'() {
    await fresh('#password');
    await type(':smile:');
    assert.equal(await value('#password'), ':smile:');
    await type(' :sm');
    assert.equal((await menuRows()).length, 0);
  },
  async 'React controlled textarea state stays in sync'() {
    await fresh('#react');
    await type('yo :heart: :sm');
    await press('Enter');
    assert.equal(await page.evaluate(() => window.reactValue), 'yo ❤️ 😄');
  },
  async 'plain contenteditable converts, including on a second line'() {
    await fresh('#ce');
    await type('hi :smile:');
    await press('Enter');
    await type(':fire:');
    const text = await page.innerText('#ce');
    assert.ok(text.includes('hi 😄') && text.includes('🔥') && !text.includes(':'), text);
  },
  async 'Lexical: the editor state gets the emoji, not just the DOM'() {
    await fresh('#lexical-chat');
    await type('hello :smile: world');
    assert.equal(await chat(), 'hello 😄 world');
  },
  async 'Lexical: Enter picks from the menu and does not send'() {
    await fresh('#lexical-chat');
    await type('nice :fir');
    await press('Enter');
    assert.equal(await chat(), 'nice 🔥');
    assert.deepEqual(await sent(), []);
    await press('Enter');
    assert.deepEqual(await sent(), ['nice 🔥']);
  },
  async 'Lexical: :D then Enter still sends the message'() {
    await fresh('#lexical-chat');
    await type('lol :D');
    assert.ok((await menuRows()).length > 0);
    assert.ok((await menuRows()).every((r) => !r.picked));
    await press('Enter');
    assert.deepEqual(await sent(), ['lol :D']);
  },
  async 'Lexical: back-to-back emoji'() {
    await fresh('#lexical-chat');
    await type(':smile::heart::fire:');
    assert.equal(await chat(), '😄❤️🔥');
  },
  async 'Lexical: shortcode in the middle of existing text'() {
    await fresh('#lexical-chat');
    await type('ab cd');
    await press('ArrowLeft');
    await press('ArrowLeft');
    await type(':smile: ');
    assert.equal(await chat(), 'ab 😄 cd');
  },
  async 'Lexical: undo keeps the shortcode instead of converting it again'() {
    await fresh('#lexical-rich');
    await type('hi :smile:');
    assert.equal(await rich(), 'hi 😄');
    await press('ControlOrMeta+z');
    assert.ok((await rich()).includes('smile'), await rich());
  },
  async 'Lexical: the next message works after sending'() {
    await fresh('#lexical-chat');
    await type(':wave:');
    await press('Enter');
    await type('again :wave:');
    await press('Enter');
    assert.deepEqual(await sent(), ['👋', 'again 👋']);
  },
  async 'Lexical rich text: works on a second paragraph'() {
    await fresh('#lexical-rich');
    await type('first');
    await press('Enter');
    await type('second :tada:');
    assert.equal(await rich(), 'first\n\nsecond 🎉');
  },
  async 'used emoji rank higher next time'() {
    await fresh('#plain');
    await type(':ca');
    const before = await menuRows();
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter');
    await fresh('#plain');
    await type(':ca');
    assert.equal((await menuRows())[0].text, before[2].text);
  },
  async 'the toolbar popup turns the extension off and on'() {
    // Unpacked extension IDs are derived from the folder path.
    const id = [...createHash('sha256').update(extensionPath).digest('hex').slice(0, 32)]
      .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
      .join('');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);

    await popup.uncheck('#enabled');
    await fresh('#plain');
    await type(':smile:');
    assert.equal(await value('#plain'), ':smile:');

    await popup.check('#enabled');
    await settle();
    await fresh('#plain');
    await type(':smile:');
    assert.equal(await value('#plain'), '😄');
    await popup.close();
  },
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try {
    await run();
    console.log(`✔ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✖ ${name}\n  ${error.message.split('\n').slice(0, 6).join('\n  ')}`);
  }
}

if (pageErrors.length) {
  failed++;
  console.log(`✖ page errors:\n  ${[...new Set(pageErrors)].join('\n  ')}`);
}

// Screenshots for checking the menu by eye.
if (process.env.SHOTS) {
  await fresh('#lexical-chat');
  await type('this is great :sm');
  await page.screenshot({ path: join(process.env.SHOTS, 'lexical.png') });
  await fresh('#plain');
  await type('line one\nline two :he');
  await page.screenshot({ path: join(process.env.SHOTS, 'textarea.png') });
}

console.log(`\n${Object.keys(tests).length - failed} passed, ${failed} failed`);
await context.close();
server.close();
rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
