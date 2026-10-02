// 대화 분석 — 카카오톡 같은 대화를 넣으면 ① 있었던 일을 정리하고 ② 네 가지 눈으로 보여 준다.
//   나그네의 눈(제3자) · 내 편(감정 타당화) · 내 몫(바꿀 수 있었던 것 / 내 몫이 아닌 것) · 다음 한 걸음(답장 초안)
//  사람은 다투면 '상대를 너무 믿거나, 사람은 다 소용없다'로 기운다. 네 가지를 같은 사실 위에 나란히 놓아 그 쏠림을 줄이는 것이 목적이다.
//  · 대화 원문은 이 기기 안에서만 읽는다. 이름은 '나'·'상대방'으로 바꾸고 전화번호·계좌·주소(URL)·이메일은 가린 뒤, 고른 구간만 AI 로 보낸다.
//  · 결과도 원문도 저장하지 않는다(화면을 닫으면 사라진다).
//  · 폭력·협박·스토킹이 보이면 '양쪽 입장'을 말하지 않는다 — 안전 안내가 먼저다.
//  · 결과의 '가장 걸리는 생각'은 햇님의 햇살 상담(생각 정리 실습)으로 넘길 수 있다.
window.TalkCheck = {
  MAX_CHARS: 9000,      // AI 로 보내는 대화의 최대 길이(뒤에서부터 자른다 — 다툼은 대개 끝부분에 있다)
  _msgs: [], _me: '', _res: null, _tab: 'neutral',

  _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  // ── 카카오톡 내보내기 읽기 ─────────────────────────────────────────
  //  PC:      [이름] [오후 3:12] 내용
  //  안드로이드: 2026년 10월 1일 오후 3:12, 이름 : 내용
  //  아이폰:   2026. 10. 1. 오후 3:12, 이름 : 내용
  //  그 밖의 글(그냥 붙여넣은 대화)은 "이름: 내용" 줄을 찾고, 그것도 아니면 통째로 한 덩어리로 본다.
  parse(text) {
    const out = [];
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const rPc = /^\[([^\]]{1,30})\]\s*\[(오전|오후)?\s*\d{1,2}:\d{2}\]\s*(.*)$/;
    const rMo = /^\d{4}[년.]\s*\d{1,2}[월.]\s*\d{1,2}[일.]?\s*(?:[월화수목금토일]요일\s*)?(?:오전|오후)?\s*\d{1,2}:\d{2},\s*([^:]{1,30}?)\s*:\s*(.*)$/;
    const rPlain = /^([^\s:：\[\]]{1,12})\s*[:：]\s*(.+)$/;
    let plainHits = 0;
    lines.forEach(l => { if (rPlain.test(l.trim())) plainHits++; });
    const usePlain = plainHits >= 3;
    lines.forEach(raw => {
      const l = raw.trim(); if (!l) return;
      if (/^-{5,}.*-{5,}$/.test(l) || /^\d{4}년 \d{1,2}월 \d{1,2}일 [월화수목금토일]요일$/.test(l) || /저장한 날짜|님과 카카오톡 대화|Talk_|^Date Saved/.test(l)) return;
      let m = l.match(rPc); if (m) { out.push({ who: m[1].trim(), text: m[3] }); return; }
      m = l.match(rMo); if (m) { out.push({ who: m[1].trim(), text: m[2] }); return; }
      if (/님이 들어왔습니다|님이 나갔습니다|님을 초대했습니다|메시지가 삭제되었습니다/.test(l)) return;
      m = usePlain ? l.match(rPlain) : null; if (m) { out.push({ who: m[1].trim(), text: m[2] }); return; }
      if (out.length) out[out.length - 1].text += '\n' + l;       // 여러 줄 메시지의 이어지는 줄
      else out.push({ who: '', text: l });
    });
    return out.filter(x => x.text && x.text.trim());
  },

  // 개인정보 가리기 — 전화번호·계좌처럼 긴 숫자·이메일·주소(URL)
  _mask(t) {
    return String(t || '')
      .replace(/https?:\/\/\S+/gi, '(링크)')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '(이메일)')
      .replace(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '(전화번호)')
      .replace(/\d{2,6}[-\s]\d{2,6}[-\s]\d{2,8}([-\s]\d{1,6})?/g, '(번호)')
      .replace(/\d{9,}/g, '(번호)')
      .replace(/^(사진|동영상|이모티콘|파일: .*)$/gm, '($1)');
  },

  // AI 로 보낼 글 — 나는 '나', 나머지는 '상대방'(여럿이면 상대방1·2…). 본문에 나오는 실제 이름도 바꾼다.
  _transcript(n) {
    const msgs = this._msgs.slice(-n);
    const others = [...new Set(msgs.map(m => m.who).filter(w => w && w !== this._me))];
    const label = w => !w ? '' : (w === this._me ? '나' : (others.length > 1 ? '상대방' + (others.indexOf(w) + 1) : '상대방'));
    const names = [this._me, ...others].filter(w => w && w.length >= 2);
    let lines = msgs.map(m => {
      let t = this._mask(m.text);
      names.forEach(nm => { t = t.split(nm).join(label(nm)); });
      return (m.who ? label(m.who) + ': ' : '') + t.replace(/\n/g, ' / ');
    });
    let s = lines.join('\n');
    if (s.length > this.MAX_CHARS) s = '(앞부분 생략)\n' + s.slice(s.length - this.MAX_CHARS).replace(/^[^\n]*\n/, '');
    return s;
  },

  // ── 화면 ──────────────────────────────────────────────────────────
  open() {
    this.close();
    this._msgs = []; this._me = ''; this._res = null; this._tab = 'neutral';
    const ov = document.createElement('div');
    ov.id = 'talkcheck-ov';
    ov.dataset.ovGuard = '1';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 1250; background: var(--bg-primary); display: flex; flex-direction: column;';
    ov.innerHTML = `
      <div style="flex: 0 0 auto; display: flex; align-items: center; gap: 0.5rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--glass-border); background: var(--bg-secondary);">
        <b style="flex: 1 1 auto; font-size: 1rem; color: var(--text-primary);">대화 분석</b>
        <button type="button" onclick="window.TalkCheck.close()" style="all: unset; cursor: pointer; padding: 0.4rem 0.8rem; border-radius: 999px; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); background: var(--bg-tertiary);">닫기</button>
      </div>
      <div id="tc-body" style="flex: 1 1 auto; overflow-y: auto; padding: 1rem; max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box;"></div>`;
    document.body.appendChild(ov);
    this._renderInput();
  },
  close() { const o = document.getElementById('talkcheck-ov'); if (o) o.remove(); },
  _body() { return document.getElementById('tc-body'); },
  _field: 'width: 100%; box-sizing: border-box; font: inherit; font-size: 0.9rem; color: var(--text-primary); background: var(--bg-secondary); border: 1.5px solid var(--glass-border); border-radius: 12px; padding: 0.65rem 0.8rem;',

  _renderInput() {
    const b = this._body(); if (!b) return;
    const EMO = ['화', '억울함', '서운함', '불안', '서러움', '외로움', '죄책감', '수치심', '허탈함'];
    b.innerHTML = `
      <p style="margin: 0 0 0.9rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-secondary);">다툰 대화를 넣으면 <b style="color: var(--text-primary);">있었던 일을 먼저 정리</b>하고, 네 가지 눈으로 보여 드려요 — 지나가는 사람의 눈, 내 편, 내 몫, 다음 한 걸음.</p>

      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">1. 대화 넣기</div>
      <div style="display: flex; gap: 0.4rem; margin-bottom: 0.4rem;">
        <button type="button" onclick="document.getElementById('tc-file').click()" class="btn-secondary" style="width: auto; flex: 0 0 auto; font-size: 0.82rem; padding: 0.5rem 0.9rem;">카카오톡 내보내기 파일(.txt)</button>
        <input id="tc-file" type="file" accept=".txt,text/plain" hidden onchange="window.TalkCheck._file(this)">
        <button type="button" onclick="window.TalkCheck.close(); window.ImgText && window.ImgText.pick()" class="btn-secondary" style="width: auto; flex: 0 0 auto; font-size: 0.82rem; padding: 0.5rem 0.9rem;">캡처 사진</button>
      </div>
      <textarea id="tc-text" rows="6" placeholder="또는 대화를 여기에 붙여넣으세요.&#10;&#10;카카오톡: 대화방 › 메뉴 › 대화 내용 내보내기" oninput="window.TalkCheck._changed()" style="${this._field} line-height: 1.5; resize: vertical;"></textarea>
      <div id="tc-meta" style="margin: 0.4rem 0 0.9rem; font-size: 0.76rem; color: var(--text-muted);">대화는 이 기기에서만 읽어요. 이름·전화번호·계좌는 가린 뒤 고른 구간만 분석에 쓰고, 저장하지 않아요.</div>

      <div id="tc-who" style="display: none; margin-bottom: 0.9rem;"></div>

      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">2. 어떤 상황인가요 <span style="font-weight: 600; color: var(--text-muted);">(한두 줄, 안 적어도 돼요)</span></div>
      <input id="tc-sit" type="text" maxlength="120" placeholder="예: 직장 상사가 단톡방에서 나만 콕 집어 말했다" style="${this._field} margin-bottom: 0.9rem;">

      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">3. 지금 내 마음</div>
      <div id="tc-emo" style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem;">${EMO.map(e => `<button type="button" data-e="${e}" aria-pressed="false" onclick="window.TalkCheck._emo(this)" style="all: unset; cursor: pointer; padding: 0.32rem 0.75rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); border: 1.5px solid var(--glass-border); background: var(--bg-secondary);">${e}</button>`).join('')}</div>
      <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.1rem;">
        <input id="tc-score" type="range" min="0" max="100" step="5" value="70" oninput="document.getElementById('tc-score-v').textContent = this.value" style="flex: 1 1 auto; accent-color: var(--accent-primary);">
        <b id="tc-score-v" style="flex: 0 0 2.4rem; text-align: right; color: var(--accent-primary);">70</b>
      </div>

      <p id="tc-err" style="display: none; margin: 0 0 0.6rem; font-size: 0.8rem; color: #c14a4a;"></p>
      <button type="button" id="tc-go" class="btn-primary" style="width: 100%; padding: 0.85rem;" onclick="window.TalkCheck.run()">분석하기</button>
      <p style="margin: 0.7rem 0 0; font-size: 0.72rem; line-height: 1.5; color: var(--text-muted);">한쪽이 넣은 대화만 보고 하는 분석이에요. 상대의 속마음까지 알 수는 없어요.</p>`;
  },

  _file(inp) {
    const f = inp.files && inp.files[0]; inp.value = '';
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { this._say('파일이 너무 커요. 다툰 부분만 복사해서 붙여넣어 주세요.'); return; }
    const rd = new FileReader();
    rd.onload = () => { const ta = document.getElementById('tc-text'); if (ta) { ta.value = String(rd.result || ''); this._changed(); } };
    rd.onerror = () => this._say('파일을 읽지 못했어요. 대화를 복사해서 붙여넣어 주세요.');
    rd.readAsText(f, 'utf-8');
  },
  _say(m) { const e = document.getElementById('tc-err'); if (e) { e.textContent = m; e.style.display = m ? 'block' : 'none'; } },

  // 넣은 글이 바뀌면 다시 읽고, '나는 누구인지'와 '어디까지 볼지'를 묻는다
  _changed() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      const ta = document.getElementById('tc-text'); if (!ta) return;
      this._msgs = this.parse(ta.value);
      const names = [...new Set(this._msgs.map(m => m.who).filter(Boolean))];
      const meta = document.getElementById('tc-meta'), who = document.getElementById('tc-who');
      if (meta) meta.textContent = this._msgs.length ? `메시지 ${this._msgs.length.toLocaleString()}개를 읽었어요. 이름·전화번호·계좌는 가린 뒤 고른 구간만 분석에 쓰고, 저장하지 않아요.` : '대화는 이 기기에서만 읽어요. 이름·전화번호·계좌는 가린 뒤 고른 구간만 분석에 쓰고, 저장하지 않아요.';
      if (!who) return;
      if (names.length < 2) { who.style.display = 'none'; who.innerHTML = ''; this._me = ''; return; }
      if (!names.includes(this._me)) this._me = '';
      const chip = (label, val, on, fn) => `<button type="button" onclick="${fn}" data-v="${this._esc(val)}" style="all: unset; cursor: pointer; padding: 0.32rem 0.75rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); border: 1.5px solid ${on ? 'var(--accent-primary)' : 'var(--glass-border)'}; background: ${on ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--bg-secondary)'};">${this._esc(label)}</button>`;
      const n = this._n || 200;
      who.style.display = 'block';
      who.innerHTML = `
        <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">이 중에 누가 나인가요</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.7rem;">${names.slice(0, 8).map(nm => chip(nm, nm, nm === this._me, 'window.TalkCheck._pickMe(this.dataset.v)')).join('')}</div>
        ${this._msgs.length > 60 ? `<div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">어디까지 볼까요</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">${[[60, '마지막 60개'], [200, '마지막 200개'], [500, '마지막 500개']].map(x => chip(x[1], x[0], n === x[0], 'window.TalkCheck._pickN(+this.dataset.v)')).join('')}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.3rem;">다툰 부분만 붙여넣으면 더 정확해요.</div>` : ''}`;
    }, 250);
  },
  _pickMe(v) { this._me = v; this._changed(); },
  _pickN(v) { this._n = v; this._changed(); },
  _emo(el) {
    const on = el.getAttribute('aria-pressed') === 'true';
    if (!on && document.querySelectorAll('#tc-emo [aria-pressed="true"]').length >= 3) return;
    el.setAttribute('aria-pressed', on ? 'false' : 'true');
    el.style.borderColor = on ? 'var(--glass-border)' : 'var(--accent-primary)';
    el.style.background = on ? 'var(--bg-secondary)' : 'color-mix(in srgb, var(--accent-primary) 12%, transparent)';
  },

  // ── 분석 ──────────────────────────────────────────────────────────
  async run() {
    this._say('');
    const ta = document.getElementById('tc-text');
    this._msgs = this.parse(ta ? ta.value : '');
    const chars = this._msgs.reduce((a, m) => a + m.text.length, 0);
    if (this._msgs.length < 2 || chars < 40) return this._say('대화를 조금 더 넣어 주세요. 서로 주고받은 말이 있어야 볼 수 있어요.');
    const names = [...new Set(this._msgs.map(m => m.who).filter(Boolean))];
    if (names.length >= 2 && !this._me) return this._say('이 중에 누가 나인지 골라 주세요.');
    const sit = ((document.getElementById('tc-sit') || {}).value || '').trim();
    const emos = [...document.querySelectorAll('#tc-emo [aria-pressed="true"]')].map(b => b.dataset.e);
    const score = +((document.getElementById('tc-score') || {}).value || 0);
    const transcript = this._transcript(this._n || 200);

    // 넣은 글에 자살·자해 신호가 있으면 분석보다 안전이 먼저다 — 상담 채팅의 위기 대응으로 넘긴다
    if (window.LLM && window.LLM.CRISIS_RE && window.LLM.CRISIS_RE.test(sit)) {
      this.close();
      const inp = document.getElementById('chat-input');
      if (inp && window.App) { window.App.switchTab('chat', true); inp.value = sit; window.App.sendMessage(); }
      return;
    }

    const b = this._body();
    b.innerHTML = `<div style="padding: 3rem 1rem; text-align: center; color: var(--text-secondary);">
      <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.4rem;">대화를 읽고 있어요</div>
      <div style="font-size: 0.82rem;">있었던 일을 먼저 정리한 뒤 네 가지 눈으로 볼게요. 30초쯤 걸려요.</div></div>`;

    const prompt = `당신은 사람들 사이의 다툼을 풀어 보는 일을 돕는 상담 전문가입니다. 아래는 사용자가 넣은 대화입니다. "나"가 사용자이고, 나머지는 상대방입니다. 이름과 연락처는 가려져 있습니다.

[사용자가 적은 상황] ${sit || '(없음)'}
[사용자의 지금 감정] ${emos.length ? emos.join(', ') : '(고르지 않음)'} · 강도 ${score}/100

[대화]
${transcript}

아래 JSON 형식으로만 답하세요(설명·코드블록 없이 JSON 만). 모든 글은 한국어 존댓말, 쉬운 말로 씁니다. 문장은 짧게 — 한 문장 45자 안팎.

{
 "danger": "대화에 폭력·협박·스토킹·성적 강요·지속적인 모욕과 통제(가스라이팅)·금전 갈취가 보이면 무엇이 보이는지 한 문장. 없으면 빈 문자열",
 "timeline": ["있었던 일을 순서대로 4~7줄. 각 줄은 '나: …' 또는 '상대방: …'으로 시작. 해석 없이 실제로 오간 말과 행동만"],
 "start": "갈등이 시작된 지점 한 문장",
 "gap": "서로 엇갈린 지점 한 문장 — 한쪽은 무엇을 말했고 다른 쪽은 무엇으로 들었는지",
 "readings": ["대화에 적힌 사실이 아니라 '나'의 해석·짐작으로 보이는 것 1~3개. 없으면 빈 배열"],
 "neutral": ["지나가는 사람이 본 모습 3~4문장. 양쪽 입장을 같은 무게로. 누가 옳다고 판정하지 않는다"],
 "ally": ["'나'의 감정이 왜 그럴 만했는지 3~4문장. 상대를 깎아내리지 않고 '나'의 마음을 알아준다"],
 "mine": {"can": ["내가 다르게 할 수 있었던 것 1~3개. 비난이 아니라 다음에 써먹을 수 있는 말투로. 없으면 빈 배열"], "not": ["내 몫이 아닌 것(상대의 선택·말투·상황) 1~3개"]},
 "next": {"soft": "부드럽게 풀고 싶을 때 보낼 답장 초안(2~3문장, 사용자의 평소 말투에 맞춰)", "firm": "내 입장을 분명히 할 때 보낼 답장 초안", "space": "잠시 거리를 두고 싶을 때 보낼 답장 초안", "wait": "지금은 답하지 않는 편이 나은 경우와 그 이유 한 문장"},
 "thought": "이 일로 '나'의 마음을 가장 무겁게 하는 생각 한 문장('나'의 말투로, 예: '나를 무시하는 거야'). 대화에서 드러난 것만",
 "limit": "이 대화만으로는 알 수 없는 것 한 문장"
}

규칙:
- danger 가 비어 있지 않으면 neutral 에 '양쪽 다 잘못' 같은 말을 쓰지 않습니다. mine.can 은 빈 배열로 두고, next 에는 화해가 아니라 안전하게 거리를 두는 문장만 씁니다.
- 대화에 없는 일을 지어내지 않습니다. 진단명이나 성격 유형(나르시시스트 등)을 붙이지 않습니다.
- 사용자가 자책이 심해 보이면 mine.not 을 충분히, 남 탓이 심해 보이면 mine.can 을 한 가지는 꼭 적습니다.`;

    let res = null, raw = '';
    try {
      const r = await window.LLM._chatCompletion({ model: window.LLM.MODEL_HIGH || window.LLM.MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2200 }, 90000);
      if (r && r.ok) {
        const d = await r.json();
        raw = ((d.choices && d.choices[0] && d.choices[0].message.content) || '').trim();
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
        if (s >= 0 && e > s) res = JSON.parse(raw.slice(s, e + 1));
      }
    } catch (e) { res = null; }
    if (!document.getElementById('talkcheck-ov')) return;      // 그 사이 닫았다
    if (!res || !Array.isArray(res.timeline)) {
      this._renderInput();
      const ta2 = document.getElementById('tc-text'); if (ta2 && ta) { ta2.value = ta.value; this._changed(); }
      return this._say('지금은 분석하지 못했어요. 잠시 뒤에 다시 눌러 주세요.');
    }
    this._res = res; this._tab = res.danger ? 'ally' : 'neutral';
    this._renderResult();
  },

  _list(a) { return (Array.isArray(a) ? a : [a]).filter(Boolean); },
  _renderResult() {
    const b = this._body(), r = this._res, esc = this._esc.bind(this); if (!b || !r) return;
    const card = 'background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 16px; padding: 0.9rem 1rem; margin-bottom: 0.8rem;';
    const h = t => `<div style="font-size: 0.72rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 0.35rem;">${t}</div>`;
    const lines = a => this._list(a).map(x => `<p style="margin: 0 0 0.45rem; font-size: 0.9rem; line-height: 1.65; color: var(--text-primary);">${esc(x)}</p>`).join('');
    const bullets = a => this._list(a).map(x => `<div style="display: flex; gap: 0.45rem; margin-bottom: 0.35rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-primary);"><span style="flex: 0 0 auto; color: var(--accent-primary);">•</span><span>${esc(x)}</span></div>`).join('');

    const danger = r.danger ? `
      <div style="${card} border-color: #c0564f; background: color-mix(in srgb, #c0564f 8%, var(--bg-secondary));">
        <div style="font-size: 0.72rem; font-weight: 800; color: #c0564f; margin-bottom: 0.35rem;">먼저 확인해 주세요</div>
        <p style="margin: 0 0 0.5rem; font-size: 0.9rem; line-height: 1.65; color: var(--text-primary);">${esc(r.danger)}</p>
        <p style="margin: 0 0 0.5rem; font-size: 0.86rem; line-height: 1.6; color: var(--text-primary);">이런 일은 서로 조금씩 양보해서 풀 문제가 아니에요. 지금 안전한지가 먼저예요.</p>
        <div style="font-size: 0.84rem; line-height: 1.8; color: var(--text-primary);">· 위급하면 <b>112</b><br>· 여성긴급전화 <b>1366</b> (24시간, 가정폭력·성폭력·스토킹)<br>· 학교폭력 <b>117</b> · 청소년 <b>1388</b><br>· 직장 내 괴롭힘 고용노동부 <b>1350</b></div>
      </div>` : '';

    const tl = this._list(r.timeline).map(x => {
      const mine = /^나\s*[:：]/.test(x);
      const t = String(x).replace(/^(나|상대방\d?)\s*[:：]\s*/, '');
      const who = (String(x).match(/^(나|상대방\d?)\s*[:：]/) || [])[1] || '';
      return `<div style="display: flex; gap: 0.5rem; margin-bottom: 0.4rem;">
        <span style="flex: 0 0 3.1rem; font-size: 0.7rem; font-weight: 800; padding-top: 0.15rem; color: ${mine ? 'var(--accent-primary)' : 'var(--text-muted)'};">${esc(who)}</span>
        <span style="font-size: 0.88rem; line-height: 1.6; color: var(--text-primary);">${esc(t)}</span></div>`;
    }).join('');

    const TABS = r.danger ? [['ally', '내 편'], ['next', '다음 한 걸음']] : [['neutral', '나그네의 눈'], ['ally', '내 편'], ['mine', '내 몫'], ['next', '다음 한 걸음']];
    if (!TABS.some(t => t[0] === this._tab)) this._tab = TABS[0][0];
    const tabBar = `<div style="display: flex; gap: 0.3rem; margin-bottom: 0.6rem; overflow-x: auto; scrollbar-width: none;">${TABS.map(t => `
      <button type="button" onclick="window.TalkCheck._go('${t[0]}')" style="all: unset; cursor: pointer; flex: 1 0 auto; text-align: center; padding: 0.55rem 0.7rem; border-radius: 12px; font-size: 0.84rem; font-weight: 800; white-space: nowrap; color: ${this._tab === t[0] ? '#fff' : 'var(--text-secondary)'}; background: ${this._tab === t[0] ? 'var(--accent-primary)' : 'var(--bg-tertiary)'};">${t[1]}</button>`).join('')}</div>`;

    let pane = '';
    if (this._tab === 'neutral') pane = h('지나가는 사람이 본다면') + lines(r.neutral);
    else if (this._tab === 'ally') pane = h('내 마음이 그럴 만했던 이유') + lines(r.ally);
    else if (this._tab === 'mine') {
      const m = r.mine || {};
      pane = h('내가 다르게 할 수 있었던 것') + (this._list(m.can).length ? bullets(m.can) : '<p style="margin: 0 0 0.45rem; font-size: 0.88rem; color: var(--text-secondary);">이 대화에서는 딱히 보이지 않아요.</p>')
        + '<div style="height: 0.5rem;"></div>' + h('내 몫이 아닌 것') + bullets(m.not);
    } else {
      const n = r.next || {};
      const draft = (label, t) => t ? `<div style="border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.6rem 0.75rem; margin-bottom: 0.45rem; background: var(--bg-primary);">
        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem;"><b style="flex: 1 1 auto; font-size: 0.74rem; color: var(--accent-primary);">${label}</b>
          <button type="button" data-copy="${esc(t)}" onclick="window.TalkCheck._copy(this)" style="all: unset; cursor: pointer; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 999px; color: var(--text-secondary); background: var(--bg-tertiary);">복사</button></div>
        <div style="font-size: 0.88rem; line-height: 1.6; color: var(--text-primary);">${esc(t)}</div></div>` : '';
      pane = h('보낼 수 있는 답장') + (r.danger ? '' : draft('부드럽게 풀고 싶을 때', n.soft)) + draft('내 입장을 분명히', n.firm) + draft('잠시 거리를 두고 싶을 때', n.space)
        + (n.wait ? `<p style="margin: 0.5rem 0 0; font-size: 0.84rem; line-height: 1.6; color: var(--text-secondary);"><b style="color: var(--text-primary);">답하지 않는 것도 선택이에요.</b> ${esc(n.wait)}</p>` : '');
    }

    const thought = (!r.danger && r.thought) ? `
      <div style="${card} border-color: #d98a4a;">
        <div style="font-size: 0.72rem; font-weight: 800; color: #d98a4a; margin-bottom: 0.35rem;">지금 마음을 가장 무겁게 하는 생각</div>
        <p style="margin: 0 0 0.6rem; font-size: 0.95rem; font-weight: 700; line-height: 1.5; color: var(--text-primary);">"${esc(r.thought)}"</p>
        <p style="margin: 0 0 0.7rem; font-size: 0.82rem; line-height: 1.6; color: var(--text-secondary);">이 생각이 사실인지, 햇님과 6단계로 직접 살펴볼 수 있어요. 같은 일이 또 생겨도 덜 흔들리게 돼요.</p>
        <button type="button" class="btn-primary" style="width: 100%; padding: 0.7rem; background: #d98a4a;" onclick="window.TalkCheck._toHaru()">이 생각, 햇님과 살펴보기 ›</button>
      </div>` : '';

    b.innerHTML = `
      ${danger}
      <div style="${card}">
        ${h('있었던 일')}
        ${tl}
        ${r.start ? `<div style="margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px dashed var(--glass-border);">${h('갈등이 시작된 곳')}<p style="margin: 0; font-size: 0.88rem; line-height: 1.6; color: var(--text-primary);">${esc(r.start)}</p></div>` : ''}
        ${r.gap ? `<div style="margin-top: 0.6rem;">${h('서로 엇갈린 곳')}<p style="margin: 0; font-size: 0.88rem; line-height: 1.6; color: var(--text-primary);">${esc(r.gap)}</p></div>` : ''}
        ${this._list(r.readings).length ? `<div style="margin-top: 0.6rem;">${h('대화에 적힌 사실이 아니라, 내가 짐작한 것')}${bullets(r.readings)}</div>` : ''}
      </div>
      ${tabBar}
      <div style="${card}">${pane}</div>
      ${thought}
      <p style="margin: 0 0 0.8rem; font-size: 0.74rem; line-height: 1.55; color: var(--text-muted);">${r.limit ? esc(r.limit) + ' ' : ''}한쪽이 넣은 대화만 보고 한 분석이에요. 대화 원문과 이 결과는 저장되지 않아요.</p>
      <button type="button" class="btn-secondary" style="width: 100%;" onclick="window.TalkCheck.open()">다른 대화 넣기</button>`;
  },
  _go(t) { this._tab = t; const b = this._body(); const y = b ? b.scrollTop : 0; this._renderResult(); if (b) b.scrollTop = y; },
  _copy(el) {
    const t = el.dataset.copy || '';
    const done = () => { el.textContent = '복사됨'; setTimeout(() => { if (el.isConnected) el.textContent = '복사'; }, 1500); };
    try { navigator.clipboard.writeText(t).then(done, () => {}); } catch (e) {}
  },
  // 가장 걸리는 생각을 들고 햇님의 햇살 상담으로
  _toHaru() {
    const th = (this._res && this._res.thought) || '';
    this.close();
    if (!window.App || !window.Personas) return;
    try { window.Personas.setActive('haru'); if (window.App.updatePersonaBar) window.App.updatePersonaBar(); } catch (e) {}
    window.App.switchTab('chat', true);
    const inp = document.getElementById('chat-input');
    if (inp) { inp.value = `햇님, 햇살 상담 시작할래요. 방금 다툰 대화를 돌아봤는데 "${th}"라는 생각이 계속 걸려요. 1단계부터 이끌어주세요.`; window.App.sendMessage(); }
  }
};
