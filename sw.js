const VERSION = '1.1.0';
const CACHE_PREFIX = 'kurnik:' + self.registration.scope + ':';
const CACHE = CACHE_PREFIX + VERSION;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './styles/tokens.css', './styles/components.css', './styles/app.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './ui/components.js', './ui/format.js', './ui/icons.js',
  './src/app.js', './src/backup.js', './src/db.js', './src/model.js',
  './src/views.js', './src/forms.js', './src/calc/index.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(path,{cache:'reload'})))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const options = {cacheName:CACHE};
    if (request.mode === 'navigate') {
      const url = new URL(request.url);
      const scope = new URL(self.registration.scope);
      if ([scope.pathname,scope.pathname + 'index.html'].includes(url.pathname)) {
        return (await caches.match('./index.html',options)) ?? fetch(request);
      }
    }
    return (await caches.match(request,options)) ?? fetch(request);
  })());
});
