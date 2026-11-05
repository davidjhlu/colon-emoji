// Zips the extension folder for upload to the Chrome Web Store.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const out = resolve(`dist/colon-emoji-${version}.zip`);
mkdirSync('dist', { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, '.', '-x', '.*', '-x', '*/.*'], { cwd: 'extension' });
console.log(out);
