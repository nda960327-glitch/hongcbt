// ============================================================================
//  실시간 허브 — 폴링을 웹소켓으로 바꾼다
//
//  지금까지 채팅은 8~15초 주기 폴링이었다. 보내는 쪽은 즉시인데 받는 쪽은
//  최대 15초를 기다리니 "카톡보다 느리다"가 정확한 체감이다.
//  Durable Object 하나가 채널(수신자) 단위로 웹소켓들을 쥐고 있다가,
//  새 메시지가 저장되는 순간 그대로 밀어준다. 폴링은 안전망으로만 남는다.
//
//  채널 이름: 'c:<상담사id>' (상담사 기기들) · 'cl:<내담자id>' (내담자 기기들)
//  인증은 워커(/ws 라우트)가 하고, 여기는 이미 검증된 연결만 받는다.
//  Hibernation API 를 쓰므로 조용한 연결은 비용이 들지 않는다.
// ============================================================================
export class ChatHub {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 웹소켓 연결 (워커가 인증을 마치고 넘겨준다)
    if (url.pathname === '/connect') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // 이 채널의 모든 기기에 이벤트를 민다 (워커 내부에서만 호출)
    if (url.pathname === '/publish' && request.method === 'POST') {
      const text = await request.text();
      let n = 0;
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(text); n++; } catch (e) {}
      }
      return new Response(JSON.stringify({ ok: true, sent: n }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('not found', { status: 404 });
  }

  // 클라이언트의 생존 확인에만 답한다 — 대화 내용은 이 소켓으로 받지 않는다
  //  (쓰기는 전부 기존 HTTP 경로 → D1 저장 → publish. 소켓은 읽기 전용이라
  //   인증·마스킹·스로틀 같은 규칙이 한 곳에 남는다)
  webSocketMessage(ws, msg) {
    if (msg === 'ping') { try { ws.send('pong'); } catch (e) {} }
  }

  webSocketClose(ws) { try { ws.close(); } catch (e) {} }
  webSocketError(ws) { try { ws.close(); } catch (e) {} }
}
