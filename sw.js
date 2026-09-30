const CACHE_NAME = 'cbt-app-v244';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/icons.js',
  './js/storage.js',
  './js/inbox.js',
  './js/cards.js',
  './js/chatviz.js',
  './js/memory-vault.js',
  './js/personas.js',
  './js/stickers.js',
  './js/ui.js',
  './js/api.js',
  './js/rtccall.js',
  './js/prolink.js',
  './js/account.js',
  './js/freshness.js',
  './js/i18n.js',
  './js/wallet.js',
  './js/pay.js',
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
  // index.html 이 싣는데 목록에 빠져 있던 것들 — 특히 consent.js 는 앱의 첫 관문이라
  //  이게 없으면 첫 오프라인 실행이 동의 화면에서 멈춘다
  './js/consent.js',
  './js/homesimple.js',
  './js/feed.js',
  './js/forest.js',
  './js/clinics.js',
  './js/community.js',
  './js/hospital.js',
  './js/app.js',
  './manifest.json',
  './privacy.html',
  './terms.html',
  './data-deletion.html',
  './pay-done.html',
  './icon.svg',
  './icon.png',
  './icon-192.png',
  './icon-144.png',
  './icon-96.png',
  './icon-48.png'
];

const API_BASE = 'https://cbt-proxy.hongcbt.workers.dev';
// 페이지(js/calltalk.js)가 적어 둔 내 clientId·clientKey. 서비스워커는 localStorage 를 못 읽는다.
//  이 캐시는 판 번호가 바뀌어도 지우지 않는다(아래 activate 참고).
const CFG_CACHE = 'mi-client-cfg';
async function getMe() {
  try {
    const c = await caches.open(CFG_CACHE);
    const r = await c.match('/__me');
    return r ? await r.json() : null;
  } catch (e) { return null; }
}

// 웹푸시 수신 — 본문 없는 '깨우기'만 온다 (내용은 푸시에 싣지 않는다).
//  앱이 보이는 중이면 앱더러 새로고침하라고만 하고, 아니면 알림을 띄운다.
//
//  깨우기에는 '상담사가 전화를 거는 중'도 섞여 온다. 전에는 무엇이든
//  '답장이나 숙제일 수 있어요'로 띄워서, 전화가 와도 사람들은 나중에 보면 되는 줄 알았다.
//  그래서 먼저 서버에 걸려온 전화가 있는지 묻고, 있으면 전화 알림을 띄운다.
//  태그는 페이지의 알림(app.js notify)과 같은 'woorung-chat' 을 쓴다 —
//  같은 소식이 페이지와 서비스워커 양쪽에서 두 장으로 쌓이지 않게.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.some(w => w.visibilityState === 'visible');
    if (visible) {
      // 떠 있는 앱은 'wake' 를 받으면 걸려온 전화까지 스스로 확인한다
      wins.forEach(w => { try { w.postMessage({ type: 'wake' }); } catch (e) {} });
      return;
    }
    let call = null;
    const me = await getMe();
    if (me && me.clientId) {
      try {
        const qs = 'clientId=' + encodeURIComponent(me.clientId) + (me.clientKey ? '&clientKey=' + encodeURIComponent(me.clientKey) : '');
        const r = await fetch(API_BASE + '/api/rtc/incoming-client?' + qs, { cache: 'no-store' });
        if (r.ok) { const d = await r.json(); call = d && d.call; }
      } catch (e) {}
    }
    if (call) {
      await self.registration.showNotification('걸려온 상담 전화', {
        body: (call.counselorName || '상담사') + ' 님이 전화를 걸고 있어요. 눌러서 받기',
        icon: 'icon.png', badge: 'icon.png', tag: 'woorung-chat', renotify: true,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400], data: { act: 'call', callId: call.id }
      });
      return;
    }
    await self.registration.showNotification('마인드 인사이드', {
      body: '새 소식이 도착했어요 — 상담사님의 답장·숙제나 예약 알림일 수 있어요',
      icon: 'icon.png', badge: 'icon.png', tag: 'woorung-chat', renotify: true,
      vibrate: [120, 60, 120], data: { act: 'counselors' }
    });
  })());
});

// 알림 탭 → 앱 열기 + 그 알림이 가리키는 기능으로 이동
//  data.act 에 'breath' 같은 목적지가 실려 온다. 앱이 떠 있으면 postMessage 로,
//  꺼져 있으면 새 창 주소의 해시(#act=...)로 알려준다 — 두 경우 모두 app.js 가 받는다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const act = (event.notification.data && event.notification.data.act) || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if (act && c.postMessage) { try { c.postMessage({ type: 'notif-act', act }); } catch (e) {} }
          // 전화 알림이면 떠 있던 앱에 '다시 확인'을 시킨다 — 'wake' 를 받은 앱이
          //  걸려온 전화를 조회해 수신 화면을 띄운다 (notif-act 에는 'call' 목적지가 없다)
          if (act === 'call' && c.postMessage) { try { c.postMessage({ type: 'wake' }); } catch (e) {} }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(act ? './#act=' + act : './');
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
          // 내 정보(CFG_CACHE)는 판이 바뀌어도 남긴다 — 지우면 다음 푸시가 전화인지 모른다
          if (cacheName !== CACHE_NAME && cacheName !== CFG_CACHE) {
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
      // cache:'reload' 가 없으면 이 fetch 도 브라우저 HTTP 캐시에서 답을 받는다.
      //  Pages 가 js·css 에 max-age=14400(4시간) 을 붙여 보내고 있어서,
      //  '네트워크 우선'이 실제로는 '4시간 묵은 것 우선'이었다.
      //  앱을 고쳐 배포해도 기기가 옛 코드를 계속 쓰던 진짜 원인이다.
      //  (_headers 로 서버 쪽도 no-cache 로 바꿨지만, 이미 캐시를 받아 둔
      //   기기가 스스로 빠져나오려면 이쪽도 필요하다)
      fetch(req, { cache: 'reload' })
        .then((res) => {
          // 최신본을 받아오면 캐시도 같이 갱신해 오프라인에 대비한다.
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))   // 오프라인이면 마지막으로 받은 버전 사용 (?v= 무시)
    );
    return;
  }

  // 이미지·아이콘 등 정적 자원은 캐시 우선이어도 무방하다.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
  );
});
