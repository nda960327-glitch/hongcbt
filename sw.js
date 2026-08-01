const CACHE_NAME = 'cbt-app-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/llm.js',
  './js/chatbot.js',
  './js/marketplace.js',
  './js/booking.js',
  './js/app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network first strategy for index.html to ensure updates
  if (event.request.mode === 'navigate' || event.request.url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
