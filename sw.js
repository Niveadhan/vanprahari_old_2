/* Van Prahari service worker — makes the app open and work without internet */
const VER = 'vp-v1.0.0';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
const LIBS = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js'];
const TILE_CACHE = 'vp-tiles';
const TILE_MAX = 6000;
const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com', 'tile.opentopomap.org'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await c.addAll(SHELL);
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VER && k !== TILE_CACHE) await caches.delete(k);
    self.clients.claim();
  })());
});
let trimCount = 0;
async function trimTiles() {
  const c = await caches.open(TILE_CACHE); const keys = await c.keys();
  if (keys.length > TILE_MAX) for (const k of keys.slice(0, keys.length - TILE_MAX)) await c.delete(k);
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('script.google')) return;            // backend: always network
  if (TILE_HOSTS.some(h => url.hostname.endsWith(h))) {           // map tiles: cache first
    e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); if (++trimCount % 100 === 0) trimTiles(); } return r; }
      catch (err) { return new Response('', { status: 504 }); }
    })());
    return;
  }
  e.respondWith((async () => {                                     // app + libraries: cache, refresh in background
    const c = await caches.open(VER);
    const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net; if (r) return r;
    if (req.mode === 'navigate') return (await c.match('./index.html')) || new Response('Offline', { status: 503 });
    return new Response('', { status: 504 });
  })());
});
