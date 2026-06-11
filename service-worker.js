const CACHE_NAME = 'expense-tracker-v1';
const ASSETS = [
  '.', '/index.html', '/styles.css', '/script.js', '/firebase.js', '/logo.png', '/icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => { if(k !== CACHE_NAME) return caches.delete(k); })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      return caches.open(CACHE_NAME).then(cache => { cache.put(req, resp.clone()); return resp; });
    })).catch(()=> caches.match('/index.html'))
  );
});


