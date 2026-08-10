// 우렁의사 운영자 콘솔 — 서비스워커
//  소비자 앱·상담사 앱과 캐시 이름을 완전히 분리한다.
//  여기엔 푸시가 없다. 운영자는 알림을 받을 이유가 없고,
//  이 앱의 존재 이유는 'PC에서 빨리 열리는 것' 하나다.

const CACHE = 'uroong-ops-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k.startsWith('uroong-ops')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 네트워크 우선. 운영 도구는 자주 고치게 되고,
//  낡은 화면으로 정산을 처리하는 쪽이 훨씬 나쁘다.
//  API 응답은 절대 캐시하지 않는다 — 운영 화면에 옛 숫자가 뜨면 안 된다.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 워커 API·글꼴은 건드리지 않는다
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    try {
      // cache:'reload' 가 없으면 브라우저 HTTP 캐시가 옛 파일을 돌려준다
      const net = await fetch(req, { cache: 'reload' });
      if (net && net.ok) { const c = await caches.open(CACHE); c.put(req, net.clone()); }
      return net;
    } catch (err) {
      const hit = await caches.match(req);
      return hit || caches.match('./index.html');
    }
  })());
});
