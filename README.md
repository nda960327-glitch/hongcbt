# CBT AI 프록시 서버

브라우저에 OpenAI 키를 노출하지 않기 위한 **키 숨김 중계 서버**입니다.
정적 PWA는 그대로 두고, AI 호출만 이 서버를 거치게 합니다.

```
브라우저 ──(키 없음)──▶ 이 서버 ──(숨긴 키)──▶ OpenAI ──▶ 서버 ──▶ 브라우저
```

## 배포 (Cloudflare Workers · 무료)

```bash
npm i -g wrangler
wrangler login
cd server

# 1) 새로 발급한 OpenAI 키를 서버 비밀값으로 저장 (파일에 절대 넣지 말 것)
wrangler secret put OPENAI_API_KEY

# 2) (선택) 허용 도메인 제한 — 아무 곳에서나 못 부르게
wrangler secret put ALLOWED_ORIGIN   # 예: https://your-app.com

# 3) 배포
wrangler deploy
```

배포되면 `https://cbt-proxy.<계정>.workers.dev` 같은 주소가 나옵니다.
그 주소를 **`js/llm.js` 의 `BACKEND_URL`** 에 넣으면 앱이 자동으로 프록시 모드로 동작합니다.

```js
// js/llm.js
BACKEND_URL: "https://cbt-proxy.<계정>.workers.dev",
```

## 지금 꼭 해야 할 일 (중요)

1. **기존 하드코딩됐던 OpenAI 키를 즉시 폐기(revoke)** 하세요.
   → https://platform.openai.com/api-keys 에서 삭제 후 **새 키를 발급**해 위 `secret` 에만 넣습니다.
   (이미 코드에서는 제거했지만, git 히스토리에는 남아 있으므로 폐기가 반드시 필요합니다.)

## 남은 과제 — Pro 접근 제어

지금 구조는 "서버가 키를 숨긴다"까지입니다. 하지만 **누가 Pro인지**(결제/인증)는
아직 클라이언트 토글이라 우회가 가능합니다. 실제 서비스로 가려면 다음이 필요합니다:

- 사용자 인증(로그인) + 결제 검증(App Store / 구글 결제 / 스트라이프)
- 서버에서 사용자별 요청 한도·과금 관리
- (권장) 요청당 사용량 로깅·레이트리밋

원하시면 이 인증·결제 계층 설계도 이어서 도와드립니다.

## 대안 호스팅

Cloudflare 대신 Vercel/Netlify Functions, 또는 Node/Express로도 동일하게 만들 수 있습니다.
사용하시는 호스팅을 알려주시면 그 형식으로 코드를 드리겠습니다.
