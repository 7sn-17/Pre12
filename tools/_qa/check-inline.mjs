// QA: extract every inline <script> from the built pages and syntax-check it.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pages = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'inline-'));
let checked = 0, bad = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (/\bsrc=/.test(attrs)) continue;
    if (!body.trim()) continue;
    const f = join(dir, `${page.replace(/[^\w.]/g, '_')}_${i++}.js`);
    writeFileSync(f, body);
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
      checked++;
    } catch (e) {
      bad++;
      const out = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
      console.log(`❌ ${page} inline script #${i - 1}:\n${out.split('\n').slice(0, 6).join('\n')}`);
    }
  }
}
console.log(`inline scripts checked: ${checked} · broken: ${bad}`);
process.exit(bad ? 1 : 0);
