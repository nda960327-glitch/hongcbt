const CACHE_NAME = 'cbt-app-v102';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/icons.js',
  './js/storage.js',
  './js/memory-vault.js',
  './js/personas.js',
  './js/stickers.js',
  './js/ui.js',
  './js/api.js',
  './js/i18n.js',
  './js/wallet.js',
  './js/subscription.js',
  './js/calltalk.js',
  './js/calm.js',
  './js/voice.js',
  './js/llm.js',
  './js/chatbot.js',
  './js/marketplace.js',
  './js/booking.js',
  './js/thought-record.js',
  './js/growth.js',
  './js/missions.js',
  './js/weekly.js',
  './js/sleep.js',
  './js/onboard.js',
  './js/stickershop.js',
  './js/applock.js',
  './js/safety.js',
  './js/admin.js',
  './js/dashboard.js',
  './js/learn.js',
  './js/sfx.js',
  './js/game.js',
  './js/mail.js',
  './js/assess-charts.js',
  './js/payout.js',
  './js/careplan.js',
  './js/safetyplan.js',
  './js/homework.js',
  './js/goals.js',
  './js/progress.js',
  './js/assess.js',
  './js/room.js',
  './js/farm.js',
  './js/closet.js',
  './js/app.js',
  './manifest.json',
  './privacy.html',
  './terms.html',
  './data-deletion.html',
  './icon.svg',
  './icon.png',
  './icon-192.png',
  './icon-144.png',
  './icon-96.png',
  './icon-48.png'
];

// 알림 탭 → 앱(챗봇 화면) 열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

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
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // API 호출(POST 등)은 절대 가로채지 않는다.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;

  // 코드와 화면은 '네트워크 우선'. 예전에는 JS를 캐시 우선으로 주는 바람에
  // 앱을 고쳐도 기기에 옛날 코드가 계속 남아 있었다.
  const isCode = req.mode === 'navigate' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname.endsWith('.js') ||
                 url.pathname.endsWith('.css');

  if (isCode) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // 최신본을 받아오면 캐시도 같이 갱신해 오프라인에 대비한다.
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))   // 오프라인이면 마지막으로 받은 버전 사용
    );
    return;
  }

  // 이미지·아이콘 등 정적 자원은 캐시 우선이어도 무방하다.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
