// 우렁의사 프로 — 상담사 앱 서비스워커
//  소비자 앱(sw.js)과는 캐시 이름도 범위도 완전히 분리되어 있다.
//  존재 이유의 절반은 오프라인 캐시가 아니라 '푸시'다.
//  상담사가 화면을 끄고 있어도 전화가 왔다는 걸 알려야 한다.

const CACHE = 'uroong-pro-v3';
const API_BASE = 'https://cbt-proxy.hongcbt.workers.dev';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './js/rtccall.js',
  './js/app.js',
  './icon-192.png',
  './icon-96.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k.startsWith('uroong-pro')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 코드는 네트워크 우선 — 상담사 도구는 자주 고치게 되고,
//  낡은 화면이 남아 전화를 못 받는 쪽이 훨씬 나쁘다.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // API·폰트는 건드리지 않는다
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

// ── 내가 누구인지 (푸시를 받았을 때 어느 상담사인지 알아야 한다) ──────
//  서비스워커는 localStorage 를 못 읽는다. 페이지가 알려준 걸 캐시에 둔다.
async function putMe(auth) {
  const c = await caches.open('uroong-pro-cfg');
  await c.put('/__me', new Response(String(auth || '')));
}
async function getMe() {
  const c = await caches.open('uroong-pro-cfg');
  const r = await c.match('/__me');
  return r ? (await r.text()) : '';
}
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'me') e.waitUntil(putMe(d.auth));
});

// ── 푸시 ─────────────────────────────────────────────────────────────
//  페이로드는 싣지 않는다(암호화가 필요해진다). 깨우기만 하고,
//  실제 내용은 서버에 다시 물어본다. 어차피 최신 상태가 필요하다.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const auth = await getMe();
    let call = null;
    if (auth) {
      try {
        const r = await fetch(API_BASE + '/api/rtc/incoming?' + auth, { cache: 'no-store' });
        if (r.ok) { const d = await r.json(); call = d && d.call; }
      } catch (err) {}
    }

    // 앱이 이미 열려 있으면 화면이 알아서 울린다 — 알림까지 겹치지 않게 한다
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.some(w => w.visibilityState === 'visible');
    if (visible) {
      wins.forEach(w => w.postMessage({ type: 'push', call }));
      if (call) return;
    }

    if (call) {
      await self.registration.showNotification('걸려온 상담 전화', {
        body: '내담자가 통화를 요청했어요. 눌러서 받기',
        icon: './icon-192.png',
        badge: './icon-96.png',
        tag: 'rtc-call',
        renotify: true,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400],
        data: { url: './index.html?call=' + encodeURIComponent(call.id) },
        actions: [{ action: 'answer', title: '받기' }, { action: 'reject', title: '거절' }]
      });
    } else {
      await self.registration.showNotification('우렁의사 프로', {
        body: '새 소식이 있어요',
        icon: './icon-192.png',
        badge: './icon-96.png',
        tag: 'pro-news',
        data: { url: './index.html' }
      });
    }
  })());
});

self.addEventListener('notificationclick', e => {
  const d = (e.notification && e.notification.data) || {};
  e.notification.close();
  if (e.action === 'reject') {
    e.waitUntil((async () => {
      const id = (d.url || '').split('call=')[1];
      if (!id) return;
      try {
        await fetch(API_BASE + '/api/rtc/end', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: decodeURIComponent(id), by: 'counselor' })
        });
      } catch (err) {}
    })());
    return;
  }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { w.postMessage({ type: 'open-call', url: d.url }); return w.focus(); }
    }
    return self.clients.openWindow(d.url || './index.html');
  })());
});
