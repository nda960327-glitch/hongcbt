// 마인드 인사이드 닥터 — 의사 앱 서비스워커
//  홈 화면 설치용 최소 구성. 캐시는 '네트워크 우선'이고 API 는 절대 캐시하지 않는다.
//  환자 기록이 기기에 남지 않도록 응답 본문은 캐시에 두지 않는다 (셸 파일만).
const CACHE = 'neurumind-doc-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k.startsWith('neurumind-doc')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api') || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && /\.(html|json|js|png)$|\/$/.test(u.pathname)) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)).catch(() => {}); }
    return r;
  }).catch(() => caches.match(e.request)));
});
