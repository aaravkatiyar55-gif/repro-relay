import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = join(process.cwd(),'dist');
async function files(directory) {
  const entries = await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory,entry.name)) : [join(directory,entry.name)]))).flat();
}
const paths = (await files(root)).filter(path => !path.endsWith('sw.js')).sort();
const hash = createHash('sha256');
for (const path of paths) hash.update(relative(root,path)).update(await readFile(path));
const version = hash.digest('hex').slice(0,16);
const urls = paths.map(path => './' + relative(root,path).replaceAll('\\','/'));
const worker = `const CACHE = 'repro-relay-${version}';
const PREFIX = 'repro-relay-';
const ASSETS = ${JSON.stringify(urls)};
const scope = new URL(self.registration.scope);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new URL(path,scope).href))).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(CACHE)).match(new URL('./index.html',scope).href)));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
`;
await writeFile(join(root,'sw.js'),worker);
console.log(`Offline shell ${version}: ${urls.length} files precached.`);
