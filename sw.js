const CACHE_NAME = 'cbt-app-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/llm.js',
  './js/chatbot.js',
  './js/thought-record.js',
  './js/dashboard.js',
  './js/learn.js',
  './js/app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
