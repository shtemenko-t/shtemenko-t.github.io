const CACHE = 'sovet3-v1';
const ASSETS = [
  './', 'index.html', 'app.css?v=1', 'fonts.css', 'data.js?v=1', 'app.js?v=1', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  ...[0,1,2,3,4].map(i => `img/map-${i}.webp`),
  ...['adult','child','overseer','parent'].flatMap(h => [1,2,3].map(s => `img/${h}-${s}.webp`)),
  '../fonts/lora-cyrillic-600-normal.woff2', '../fonts/lora-cyrillic-700-normal.woff2', '../fonts/lora-cyrillic-400-italic.woff2',
  '../fonts/manrope-cyrillic-400-normal.woff2', '../fonts/manrope-cyrillic-500-normal.woff2', '../fonts/manrope-cyrillic-700-normal.woff2'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sovet3-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then(r => r || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
