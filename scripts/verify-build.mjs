import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';

const root = join(process.cwd(),'dist');
const html = await readFile(join(root,'index.html'),'utf8');
const worker = await readFile(join(root,'sw.js'),'utf8');
assert.match(html,/Content-Security-Policy/);
assert.ok(!/script-src[^;]*unsafe-(?:inline|eval)/.test(html),'Application scripts must not allow inline code or eval');
assert.ok(!/<(?:script|link)[^>]+(?:src|href)="https?:/i.test(html),'The application shell must not depend on remote scripts or styles');
const paths = JSON.parse(worker.match(/const ASSETS = (\[[^\n]+\]);/)[1]);
assert.ok(paths.includes('./index.html') && paths.includes('./mark.svg'));
for (const path of paths) { assert.ok(path.startsWith('./') && !path.includes('..')); await access(join(root,path)); }
new Script(worker); // Syntax validation only; do not execute a service worker in Node.
assert.match(worker,/url\.origin !== scope\.origin/);
assert.match(worker,/url\.pathname\.startsWith\(scope\.pathname\)/);
assert.match(worker,/event\.request\.method !== 'GET'/);
assert.match(worker,/match\(new URL\('\.\/index\.html',scope\)/);
console.log(`Build checks passed: local assets, script CSP, valid offline worker, ${paths.length} existing precache files.`);
