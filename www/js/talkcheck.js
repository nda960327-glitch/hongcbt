// 대화 분석 — 카카오톡 같은 대화를 넣으면 ① 있었던 일을 정리하고 ② 네 가지 눈으로 보여 준다.
//   나그네의 눈(제3자) · 내 편(감정 타당화) · 내 몫(바꿀 수 있었던 것 / 내 몫이 아닌 것) · 다음 한 걸음(답장 초안)
//  사람은 다투면 '상대를 너무 믿거나, 사람은 다 소용없다'로 기운다. 네 가지를 같은 사실 위에 나란히 놓아 그 쏠림을 줄이는 것이 목적이다.
//  · 대화 원문은 이 기기 안에서만 읽는다. 이름은 '나'·'상대방'으로 바꾸고 전화번호·계좌·주소(URL)·이메일은 가린 뒤, 고른 구간만 AI 로 보낸다.
//  · 결과도 원문도 저장하지 않는다(화면을 닫으면 사라진다).
//  · 폭력·협박·스토킹이 보이면 '양쪽 입장'을 말하지 않는다 — 안전 안내가 먼저다.
//  · 결과의 '가장 걸리는 생각'은 햇님의 햇살 상담(생각 정리 실습)으로 넘길 수 있다.
window.TalkCheck = {
  // AI 로 보내는 대화의 최대 길이(뒤에서부터 자른다 — 다툼은 대개 끝부분에 있다). 4만 자 ≈ 짧은 메시지 2,000개쯤.
  //  비용(2026-10 DeepSeek 기준 어림): 200개 ≈ 7원, 1,000개 ≈ 15원, 4만 자 가득 ≈ 25원. 길수록 느리고(1분 넘게) 초점이 흐려진다.
  MAX_CHARS: 40000,
  _msgs: [], _me: '', _res: null, _tab: 'neutral',
  FULL_N: 100000,       // '전체'를 고른 표시
  // '전체' 분석 값(캐시) — 보내는 글자 수로 어림한 DeepSeek 비용(원)의 100배, 100캐시 단위로 올림. 200개·1,000개는 무료.
  //  어림: 한글 1자 ≈ 0.9토큰, 입력 100만 토큰 0.27달러, 출력(약 3,500토큰) 100만 토큰 1.10달러, 1달러 1,400원.
  _fullPrice() {
    const chars = Math.min(this.MAX_CHARS, this._msgs.reduce((a, m) => a + m.text.length + 6, 0)) + 2600;
    const won = (chars * 0.9 * 0.27 + 3500 * 1.10) / 1e6 * 1400;
    return Math.max(300, Math.ceil(won * 100 / 100) * 100);
  },

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
    const ROLE = /^(엄마|아빠|어머니|아버지|언니|누나|오빠|형|동생|여보|자기|남편|아내|와이프|딸|아들|할머니|할아버지|이모|고모|삼촌|.{0,6}(팀장|부장|과장|차장|대리|사원|실장|대표|사장|이사|선생|교수|선배|후배|쌤)님?)$/;
    const names = [this._me, ...others].filter(w => w && w.length >= 2 && !ROLE.test(w));
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
    const busy = this._job && (this._job.state === 'running' || (this._job.state === 'done' && !this._job.seen));
    if (!busy) { this._msgs = []; this._me = ''; this._tab = 'neutral'; }
    const ov = document.createElement('div');
    ov.id = 'talkcheck-ov';
    ov.dataset.ovGuard = '1';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 1250; background: var(--bg-primary); display: flex; flex-direction: column;';
    ov.innerHTML = `
      <div style="flex: 0 0 auto; display: flex; align-items: center; gap: 0.5rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--glass-border); background: var(--bg-secondary);">
        <b style="flex: 1 1 auto; font-size: 1.05rem; line-height: 1.6; color: var(--text-primary, #2f2923);">대화 분석</b>
        <button type="button" onclick="window.TalkCheck.close()" style="all: unset; cursor: pointer; padding: 0.4rem 0.8rem; border-radius: 999px; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); background: var(--bg-tertiary);">닫기</button>
      </div>
      <div id="tc-body" style="flex: 1 1 auto; overflow-y: auto; padding: 1rem; max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box;"></div>`;
    document.body.appendChild(ov);
    const j = this._job;
    if (j && j.state === 'running') { this._renderProgress(); return; }
    if (j && j.state === 'done' && !j.seen) { j.seen = true; this._renderResult(); return; }
    this._renderInput();
  },
  close() { const o = document.getElementById('talkcheck-ov'); if (o) o.remove(); },
  _body() { return document.getElementById('tc-body'); },
  _field: 'width: 100%; box-sizing: border-box; font: inherit; font-size: 0.9rem; color: var(--text-primary); background: var(--bg-secondary); border: 1.5px solid var(--glass-border); border-radius: 12px; padding: 0.65rem 0.8rem;',

  _renderInput() {
    const b = this._body(); if (!b) return;
    const EMO = ['화', '억울함', '서운함', '불안', '서러움', '외로움', '죄책감', '수치심', '허탈함'];
    b.innerHTML = `
      ${this._res ? `<button type="button" onclick="window.TalkCheck._renderResult()" style="all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; text-align: center; margin-bottom: 0.8rem; padding: 0.6rem; border-radius: 12px; font-size: 0.84rem; font-weight: 700; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 10%, transparent);">방금 본 분석 결과 다시 보기 ›</button>` : ''}
      <p style="margin: 0 0 0.9rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-secondary);">다툰 대화를 넣으면 <b style="color: var(--text-primary);">있었던 일을 먼저 정리</b>하고, 네 가지 눈으로 보여 드려요 — 지나가는 사람의 눈, 내 편, 내 몫, 다음 한 걸음.</p>

      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">1. 대화 넣기</div>
      <div style="display: flex; gap: 0.4rem; margin-bottom: 0.4rem;">
        <button type="button" onclick="window.TalkCheck._pickFile()" class="btn-secondary" style="width: auto; flex: 0 0 auto; font-size: 0.82rem; padding: 0.5rem 0.9rem;">카카오톡 내보내기 파일(.txt)</button>
        <input id="tc-file" type="file" accept=".txt" hidden onchange="window.TalkCheck._file(this)">
      </div>
      <textarea id="tc-text" rows="6" placeholder="또는 대화를 여기에 붙여넣으세요.&#10;&#10;카카오톡: 대화방 › 메뉴 › 대화 내용 내보내기" oninput="window.TalkCheck._changed()" style="${this._field} line-height: 1.5; resize: vertical;"></textarea>
      <details style="margin: 0.5rem 0 0; border: 1px solid var(--glass-border); border-radius: 12px; background: var(--bg-secondary);">
        <summary style="cursor: pointer; padding: 0.6rem 0.8rem; font-size: 0.82rem; font-weight: 700; color: var(--accent-primary);">카카오톡 대화, 넣는 법</summary>
        <div style="padding: 0 0.8rem 0.75rem; font-size: 0.84rem; line-height: 1.75; color: var(--text-primary);">
          ① 카카오톡 대화방 오른쪽 위 <b>≡</b> › 아래 <b>톱니바퀴</b><br>
          ② <b>대화 내용 내보내기</b> › <b>텍스트 메시지만 저장</b><br>
          ③ 뜨는 목록에서 <b>마인드 인사이드</b>를 고르면 여기로 바로 들어와요.<br>
          <span style="font-size: 0.76rem; color: var(--text-muted);">목록에 마인드 인사이드가 안 보이면 앱을 최신으로 업데이트해 주세요. PC 에서는 카카오톡 대화방 ≡ › 대화 내용 › 대화 내보내기로 저장한 파일을 위 버튼으로 고르면 돼요.</span>
        </div>
      </details>
      <div id="tc-meta" style="margin: 0.4rem 0 0.9rem; font-size: 0.76rem; color: var(--text-muted);">대화는 이 기기에서만 읽어요. 이름·전화번호·계좌는 가린 뒤 고른 구간만 분석에 쓰고, 저장하지 않아요.</div>

      <div id="tc-who" style="display: none; margin-bottom: 0.9rem;"></div>

      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">2. 누구와의 대화인가요</div>
      <div id="tc-rel" style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.9rem;">${['직장·학교', '가족', '친구', '연인·배우자', '그 밖'].map(e => `<button type="button" data-r="${e}" aria-pressed="false" onclick="window.TalkCheck._rel(this)" style="all: unset; cursor: pointer; padding: 0.32rem 0.75rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); border: 1.5px solid var(--glass-border); background: var(--bg-secondary);">${e}</button>`).join('')}</div>

      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">3. 어떤 상황인가요 <span style="font-weight: 600; color: var(--text-muted);">(한두 줄, 안 적어도 돼요)</span></div>
      <input id="tc-sit" type="text" maxlength="120" placeholder="예: 직장 상사가 단톡방에서 나만 콕 집어 말했다" style="${this._field} margin-bottom: 0.9rem;">

      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">4. 지금 내 마음</div>
      <div id="tc-emo" style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem;">${EMO.map(e => `<button type="button" data-e="${e}" aria-pressed="false" onclick="window.TalkCheck._emo(this)" style="all: unset; cursor: pointer; padding: 0.32rem 0.75rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); border: 1.5px solid var(--glass-border); background: var(--bg-secondary);">${e}</button>`).join('')}</div>
      <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.1rem;">
        <input id="tc-score" type="range" min="0" max="100" step="5" value="70" oninput="document.getElementById('tc-score-v').textContent = this.value" style="flex: 1 1 auto; accent-color: var(--accent-primary);">
        <b id="tc-score-v" style="flex: 0 0 2.4rem; text-align: right; color: var(--accent-primary);">70</b>
      </div>

      <p id="tc-err" style="display: none; margin: 0 0 0.6rem; font-size: 0.8rem; color: #c14a4a;"></p>
      <button type="button" id="tc-go" class="btn-primary" style="width: 100%; padding: 0.85rem;" onclick="window.TalkCheck.run()">분석하기</button>
      <p style="margin: 0.7rem 0 0; font-size: 0.72rem; line-height: 1.5; color: var(--text-muted);">한쪽이 넣은 대화만 보고 하는 분석이에요. 상대의 속마음까지 알 수는 없어요.</p>`;
  },

  // 파일 고르기 — 고르는 창에 .txt 파일만 보이게 한다(PC 크롬·엣지는 '모든 파일' 선택지도 뺀다). 안 되는 기기는 기본 창으로.
  async _pickFile() {
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ multiple: false, excludeAcceptAllOption: true,
          types: [{ description: '카카오톡 대화 (.txt)', accept: { 'text/plain': ['.txt'] } }] });
        if (h) this._readFile(await h.getFile());
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const i = document.getElementById('tc-file'); if (i) i.click();
  },
  _file(inp) {
    const f = inp.files && inp.files[0]; inp.value = '';
    if (!f) return;
    this._readFile(f);
  },
  _readFile(f) {
    if (!/\.txt$/i.test(f.name || '') && f.type !== 'text/plain') { this._say('.txt 파일만 넣을 수 있어요. 카카오톡 › 대화 내용 내보내기로 만든 파일을 골라 주세요.'); return; }
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
        ${this._msgs.length > 200 ? `<div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">어디까지 볼까요</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">${[[200, '마지막 200개'], [1000, '마지막 1,000개'], [100000, `전체 · ${this._fullPrice().toLocaleString()}캐시`]].map(x => chip(x[1], x[0], n === x[0], 'window.TalkCheck._pickN(+this.dataset.v)')).join('')}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.3rem;">200개·1,000개는 무료예요. 전체(최대 약 2,000개)는 캐시가 들고 1분 넘게 걸릴 수 있어요. 다툰 부분만 볼수록 정확해요.</div>` : ''}`;
    }, 250);
  },
  _pickMe(v) { this._me = v; this._changed(); },
  _pickN(v) { this._n = v; this._changed(); },
  _rel(el) {
    document.querySelectorAll('#tc-rel [data-r]').forEach(b => { const on = b === el && b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.style.borderColor = on ? 'var(--accent-primary)' : 'var(--glass-border)'; b.style.background = on ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--bg-secondary)'; });
  },
  // 말버릇 숫자 — AI 없이 이 기기에서 센다. 누가 얼마나 말했는지, 단정하는 말·사과·물음이 몇 번인지.
  _stats(n) {
    const msgs = this._msgs.slice(-n).filter(m => m.who);
    if (!this._me || msgs.length < 6) return null;
    const side = f => { const a = msgs.filter(f); const txt = a.map(m => m.text).join('\n');
      return { n: a.length, len: a.length ? Math.round(a.reduce((s, m) => s + m.text.length, 0) / a.length) : 0,
        abs: (txt.match(/항상|맨날|매번|절대|원래|한 번도|늘 |또 |언제나|도대체/g) || []).length,
        sorry: (txt.match(/미안|죄송|ㅈㅅ|잘못했|사과/g) || []).length, q: (txt.match(/\?/g) || []).length }; };
    return { me: side(m => m.who === this._me), ot: side(m => m.who !== this._me) };
  },
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
    const relEl = document.querySelector('#tc-rel [aria-pressed="true"]');
    const rel = relEl ? relEl.dataset.r : '';
    this._score0 = score; this._stat = this._stats(this._n || 200);

    // 넣은 글에 자살·자해 신호가 있으면 분석보다 안전이 먼저다 — 상담 채팅의 위기 대응으로 넘긴다
    if (window.LLM && window.LLM.CRISIS_RE && window.LLM.CRISIS_RE.test(sit)) {
      this.close();
      const inp = document.getElementById('chat-input');
      if (inp && window.App) { window.App.switchTab('chat', true); inp.value = sit; window.App.sendMessage(); }
      return;
    }

    const prompt = `당신은 사람들 사이의 다툼을 풀어 보는 일을 돕는 상담 전문가입니다. 아래는 사용자가 넣은 대화입니다. "나"가 사용자이고, 나머지는 상대방입니다. 이름과 연락처는 가려져 있습니다.

[누구와의 대화] ${rel || '(고르지 않음)'}
[사용자가 적은 상황] ${sit || '(없음)'}
[사용자의 지금 감정] ${emos.length ? emos.join(', ') : '(고르지 않음)'} · 강도 ${score}/100

[대화]
${transcript}

아래 JSON 형식으로만 답하세요(설명·코드블록 없이 JSON 만). 모든 글은 한국어 존댓말, 쉬운 말로 씁니다. 문장은 짧게 — 한 문장 45자 안팎.

{
 "danger": "대화에 폭력·협박·스토킹·성적 강요·지속적인 모욕과 통제(가스라이팅)·금전 갈취가 보이면 무엇이 보이는지 한 문장. 없으면 빈 문자열",
 "one": "이 대화를 한 문장으로 — 누구 편도 들지 않고(40자 안팎)",
 "pairs": [{"said": "상대방이 실제로 한 말(짧게 인용)", "read": "'나'가 그 말을 어떻게 받아들인 것으로 보이는지", "alt": "같은 말을 다르게 읽을 수 있는 뜻 하나(상대를 감싸려는 게 아니라 가능한 다른 뜻)"}],
 "timeline": ["있었던 일을 순서대로 4~7줄. 각 줄은 '나: …' 또는 '상대방: …'으로 시작. 해석 없이 실제로 오간 말과 행동만"],
 "start": "갈등이 시작된 지점 한 문장",
 "gap": "서로 엇갈린 지점 한 문장 — 한쪽은 무엇을 말했고 다른 쪽은 무엇으로 들었는지",
 "readings": ["대화에 적힌 사실이 아니라 '나'의 해석·짐작으로 보이는 것 1~3개. 없으면 빈 배열"],
 "neutral": ["지나가는 사람이 본 모습 3~4문장. 양쪽 입장을 같은 무게로. 누가 옳다고 판정하지 않는다"],
 "ally": ["'나'의 감정이 왜 그럴 만했는지 3~4문장. 상대를 깎아내리지 않고 '나'의 마음을 알아준다"],
 "mine": {"can": ["내가 다르게 할 수 있었던 것 1~3개. 비난이 아니라 다음에 써먹을 수 있는 말투로. 없으면 빈 배열"], "not": ["내 몫이 아닌 것(상대의 선택·말투·상황) 1~3개"]},
 "next": {"soft": "부드럽게 풀고 싶을 때 보낼 답장 초안(2~3문장, 사용자의 평소 말투에 맞춰)", "firm": "내 입장을 분명히 할 때 보낼 답장 초안", "space": "잠시 거리를 두고 싶을 때 보낼 답장 초안", "wait": "지금은 답하지 않는 편이 나은 경우와 그 이유 한 문장"},
 "audit": {
   "other": [{"sign": "상대방의 말·행동에 붙이는 이름(아래 목록에서)", "quote": "근거가 되는 실제 말(짧게 인용)", "level": "good | mild | concern | serious"}],
   "me": [{"sign": "'나'의 말·행동에 붙이는 이름(같은 목록, 같은 기준)", "quote": "근거가 되는 실제 말", "level": "good | mild | concern | serious"}],
   "tone": {"other": {"score": 0, "desc": "상대방 말투를 한 구절로(예: 날이 서 있지만 선은 넘지 않음)"}, "me": {"score": 0, "desc": "'나'의 말투를 한 구절로"}},
   "together": {"good": ["이 대화에서 보인, 함께 지내기에 좋은 신호 0~3개(근거가 된 말과 함께). 없으면 빈 배열"], "hard": ["함께 지내기에 힘든 신호 0~3개(근거와 함께). 없으면 빈 배열"], "say": "이 대화 한 번만 놓고 본 한 문장 — 사람 전체를 판정하지 않는다"},
   "path": {"kind": "distance | skill | talk | both 중 하나", "why": "그렇게 권하는 까닭 두 문장(근거가 된 말을 짚어서)", "steps": ["지금 해 볼 수 있는 구체적인 것 2~3개"]},
   "verdict": "danger | concern | ordinary | myread | unknown 중 하나",
   "verdictWhy": "그렇게 본 까닭 두 문장. 근거가 된 말을 짚어서",
   "bias": "'나'의 읽기에 쏠림이 보이면 한 문장(예: 한 번의 말을 '항상'으로 넓혀 읽음, 확인 없이 속마음을 단정함). 없으면 빈 문자열",
   "needMore": "더 확실히 알려면 무엇을 봐야 하는지 한 문장(예: 이런 일이 되풀이되는지, 다른 날의 대화)"
 },
 "plan": {
   "headline": "결론 한 문장. 돌려 말하지 않는다(예: '이건 다툼이 아니라 괴롭힘입니다. 버티는 것이 답이 아닙니다.' / '이 정도는 흔한 다툼입니다. 관계를 끊을 일은 아닙니다.')",
   "situation": "school(학교·또래) | dating(연인·배우자) | family(가족) | work(직장) | friend(친구) | other 중 하나",
   "leave": {"should": "yes | consider | no 중 하나", "why": "떠나는 것(전학·반 바꾸기·이직·부서 이동·이별·연락 끊기·거리 두기)을 권하는지와 까닭 두 문장", "how": ["떠난다면 실제로 밟을 순서 2~4개. 한국 기준으로 구체적으로"]},
   "now": ["오늘 할 것 2~3개. 누구에게 무엇을 어떻게 — 바로 할 수 있게 구체적으로"],
   "week": ["이번 주 안에 할 것 1~3개"],
   "line": "같은 일이 또 생기면 어떻게 할지 — 미리 정해 둘 선 한 문장(예: '한 번 더 물건을 던지면 그날 짐을 싸서 나온다')",
   "evidence": ["남겨 둘 증거 0~3개(캡처·날짜 기록·목격자 등). 필요 없으면 빈 배열"],
   "who": ["도움 받을 사람·기관과 연락처 1~4개"]
 },
 "heat": [{"who": "나 또는 상대방", "quote": "그 순간의 말을 18자 이내로 짧게 인용", "t": 0}],
 "spark": {"who": "나 또는 상대방", "quote": "대화에 불이 붙은 한마디(실제 대화에서 인용)", "why": "왜 이 말에서 달아올랐는지 한 문장", "instead": "그 말이 '나'의 말이었다면 같은 뜻을 덜 날카롭게 한 문장으로 다시 쓴 것. 상대방의 말이었다면 그 말을 들은 '나'가 불을 키우지 않고 할 수 있었던 답 한 문장"},
 "other": ["상대방이 오늘 일을 자기 일기에 쓴다면 — 상대방의 1인칭으로 3~4문장. 대화에서 드러난 것만 바탕으로 한 짐작. 상대를 악당으로도 성인으로도 그리지 않는다"],
 "need": {"me": "'나'가 이 대화에서 정말 원했던 것 한 구절(예: 노력을 알아주는 것)", "other": "상대방이 정말 원했던 것으로 보이는 것 한 구절"},
 "pattern": "이 다툼의 꼴을 한 구절로(예: '쫓는 사람과 피하는 사람', '지적과 변명', '서로 먼저 사과받기')",
 "thought": "이 일로 '나'의 마음을 가장 무겁게 하는 생각 한 문장('나'의 말투로, 예: '나를 무시하는 거야'). 대화에서 드러난 것만",
 "limit": "이 대화만으로는 알 수 없는 것 한 문장"
}

규칙:
- 분명하게 말합니다. 근거가 뚜렷하면 "가스라이팅입니다", "괴롭힘(따돌림)입니다", "이 관계는 당신을 해치고 있습니다", "떠나는 것을 진지하게 준비하세요"라고 돌려 말하지 않습니다. 사용자가 스스로를 의심하게 두는 것이 가장 해롭습니다. 반대로 근거가 없으면 "이 대화만으로는 그렇게 볼 수 없습니다", "이번에는 내 해석이 앞섰습니다"라고 똑같이 분명하게 말합니다. 두루뭉술하게 양쪽 다 조금씩 잘못이라고 얼버무리지 않습니다.
- 다만 판정하는 것은 <말과 행동>입니다. "그 사람의 이 말은 용납될 수 없는 말입니다"라고 하지, 사람에게 욕설이나 꼬리표를 붙이지 않습니다.
- plan(결론과 행동)은 마음을 달래는 말이 아니라 실제로 삶을 바꾸는 행동입니다.
  · school: 따돌림·괴롭힘이면 버티라고 하지 않습니다. 부모·담임에게 알리기, 학교폭력 신고·상담 117, 캡처와 날짜 기록, 학교에 피해학생 보호조치(분리·학급 교체 등)를 요청하기, 그래도 안 되면 전학을 요청하는 길(학교·교육지원청에 문의)을 순서대로 적습니다. 청소년 상담 1388.
  · dating: 통제·사실 부정·모욕·협박·폭력이 보이면 헤어짐을 준비하라고 분명히 권합니다. 안전하게 헤어지는 순서(주변에 먼저 알리기, 사람이 있는 곳이나 메시지로, 집·비밀번호·위치 공유 정리, 연락 차단, 찾아오면 112), 여성긴급전화 1366(24시간).
  · work: 괴롭힘이면 날짜·말·목격자 기록, 사내 신고 창구, 고용노동부 1350, 필요하면 부서 이동·이직 준비. 흔한 업무 마찰이면 그렇다고 말하고 일로 푸는 방법을 적습니다.
  · family: 폭력·통제면 떨어져 지낼 곳과 1366·112, 그렇지 않으면 선을 정해 말하는 법과 거리 조절.
  · leave.should: yes = 떠나는 쪽이 나를 지킴(serious 가 있거나 concern 이 되풀이로 보임) / consider = 한 번 더 같은 일이 생기면 떠날 준비 / no = 떠날 일이 아님. no 일 때 how 는 빈 배열.
  · 덧붙여, 사용자가 유독 크게 다치는 지점이 보이면(path 가 skill·both) now 나 week 에 그 마음을 다루는 연습 한 가지를 넣습니다 — 떠나는 것과 내 마음 다루기는 함께 갈 수 있습니다.
  · 미성년자로 보이면 혼자 해결하게 두지 않습니다 — 믿을 수 있는 어른에게 알리는 것을 맨 앞에 둡니다.
- audit(객관 평가)는 <사람>이 아니라 <이 대화에 나타난 말과 행동>만 평가합니다. '나'와 상대방에게 똑같은 잣대를 씁니다. 사용자가 '나'라는 이유로 봐주지 않고, 사용자가 화가 나 있다는 이유로 상대를 더 나쁘게 보지도 않습니다. 각 3~5개.
  sign 은 다음에서 고릅니다 — 해로운 쪽: 협박·위협 / 모욕·비하 / 통제(만나는 사람·돈·행동 제한) / 사실 부정(있었던 일을 없었다고 하거나 기억·판단을 의심하게 만듦 = 가스라이팅) / 죄책감 떠넘기기 / 책임 떠넘기기 / 넘겨짚기(단정) / 과장('항상·맨날') / 비꼼 / 대화 끊기·무시 / 요구만 하기. 건강한 쪽: 사과 / 인정 / 사정 설명 / 마음 묻기 / 양보 / 차분히 요청.
  level: good(건강함) · mild(흔히 있는 날 선 말) · concern(되풀이되면 해로움) · serious(한 번이어도 위험 — 협박, 폭력 암시, 스토킹, 성적 강요, 금전 갈취, 사실 부정이 여러 번).
  의견이 다른 것, 서운함을 말한 것, 한 번의 날 선 말은 가스라이팅이 아닙니다. '가스라이팅'은 사실 부정이 분명히 보일 때만 씁니다.
  verdict: danger(위험 신호가 뚜렷함 — serious 가 있음) / concern(걱정되는 패턴 — 상대의 concern 이 여럿) / ordinary(흔한 다툼 범위 — 양쪽 다 mild 중심) / myread(대화에 드러난 것보다 '나'의 해석이 앞서 있음) / unknown(이 대화만으로는 판단할 수 없음). 근거가 부족하면 unknown 을 고릅니다 — 억지로 판정하지 않습니다.
  tone.score 는 상대를 존중하는 말투인 정도(0 막말·비하 ~ 50 무뚝뚝하거나 날이 섬 ~ 100 예의 바르고 따뜻함). 반말·사투리·짧은 말투 자체는 감점하지 않습니다 — 내용이 상대를 깎아내리는지로 봅니다. 양쪽을 같은 기준으로 매깁니다.
  together 는 '좋은 사람/나쁜 사람' 판정이 아니라, 이 대화에서 드러난 신호만 적습니다(예: 좋은 신호 — 사정을 설명함, 먼저 연락함 / 힘든 신호 — 내 말을 끊고 단정함). 대화 한 번으로 사람을 다 알 수는 없다는 점을 say 에 담습니다.
  path 는 크기를 보고 정합니다. distance = 상대의 말·행동이 해로워서(concern 이상이 여럿이거나 serious) 거리를 두는 편이 나를 지킴 — "네가 예민해서"로 돌리지 않습니다. skill = 상대의 말은 흔한 수준인데 '나'가 크게 다친 경우 — 사람을 끊기보다 내 마음의 예민한 지점을 다루는 연습이 도움이 됨(예민함은 잘못이 아니라 다루는 법을 배우면 되는 것이라고 말합니다). talk = 서로 오해가 커서 대화로 풀 만함. both = 상대도 날이 섰고 '나'도 크게 반응해서, 거리 조절과 내 마음 다루기를 함께.
  예민한 사람에게 "참아라"고 하지 않고, 해로운 관계에 있는 사람에게 "네가 고쳐라"고 하지 않습니다. 애매하면 both 나 talk 을 고릅니다.
  '쓰레기', '나르시시스트', '소시오패스', '정신병' 같은 꼬리표와 진단명은 어느 쪽에도 붙이지 않습니다.
- pairs 는 1~3개. '나'의 마음을 가장 크게 건드린 말부터. danger 가 있으면 빈 배열.
- heat 는 대화의 흐름을 따라 6~10개. t 는 그 순간 대화의 긴장도(0 평온 ~ 100 폭발 직전). 처음·불이 붙은 곳·가장 높은 곳·끝을 꼭 넣는다.
- 관계(직장·가족·친구·연인)에 맞는 말투와 거리감으로 조언한다. 직장이면 예의와 기록, 가족·연인이면 마음을 알아주는 말이 먼저다.
- danger 가 비어 있지 않으면 other 는 빈 배열, spark.instead 는 빈 문자열로 둔다.
- danger 가 비어 있지 않으면 neutral 에 '양쪽 다 잘못' 같은 말을 쓰지 않습니다. mine.can 은 빈 배열로 두고, next 에는 화해가 아니라 안전하게 거리를 두는 문장만 씁니다.
- 대화에 없는 일을 지어내지 않습니다. 진단명이나 성격 유형(나르시시스트 등)을 붙이지 않습니다.
- 사용자가 자책이 심해 보이면 mine.not 을 충분히, 남 탓이 심해 보이면 mine.can 을 한 가지는 꼭 적습니다.`;

    // '전체'는 캐시를 받는다. 모자라면 시작하지 않는다. 분석에 실패하면 돌려준다(_exec).
    let paid = 0, paidId = '';
    if ((this._n || 200) >= this.FULL_N && this._msgs.length > 1000) {
      const price = this._fullPrice(), W = window.Wallet;
      const bal = W && W.balance ? W.balance() : 0;
      if (!W || bal < price) return this._say(`전체 분석은 ${price.toLocaleString()}캐시가 들어요. 지금 ${bal.toLocaleString()}캐시가 있어요. 캐시를 충전하거나 '마지막 1,000개'로 해 보세요.`);
      if (window.UI && window.UI.confirm && !(await window.UI.confirm({ title: `전체 분석 · ${price.toLocaleString()}캐시`, body: `대화 전체(최대 약 2,000개)를 한 번에 봐요. 지금 ${bal.toLocaleString()}캐시가 있어요. 분석에 실패하면 돌려 드려요.`, okLabel: '캐시 쓰고 분석하기', cancelLabel: '취소' }))) return;
      if (!W.spend(price, '대화 분석 (전체)')) return this._say('캐시가 모자라요.');
      paid = price; paidId = W.lastSpendId || '';
    }

    // 분석은 화면과 따로 돈다 — 화면을 닫거나 다른 앱에 다녀와도 멈추지 않는다. 끝나면 알려 주고, 다시 열면 결과가 보인다.
    this._job = { state: 'running', prompt, transcript, chars: transcript.length, t0: Date.now(), got: 0, first: 0, tries: 0, seen: false, raw: ta ? ta.value : '', paid, paidId };
    this._renderProgress();
    this._exec();
  },

  // 진행률 — 답이 오기 전에는 시간으로(대화가 길수록 천천히) 18%까지, 답이 흘러오기 시작하면 받은 글자 수만큼 96%까지.
  _pct() {
    const j = this._job; if (!j) return 0;
    if (j.state === 'done') return 100;
    const el = (Date.now() - j.t0) / 1000;
    const wait = 6 + j.chars / 2500;                 // 첫 글자가 오기까지 걸릴 것으로 보는 시간(초)
    if (!j.first) return Math.min(18, Math.round(18 * (1 - Math.exp(-el / wait))));
    return Math.min(96, 18 + Math.round(78 * Math.min(1, j.got / 8500)));
  },
  _renderProgress() {
    const b = this._body(); if (!b) return;
    b.innerHTML = `<div style="padding: 2.6rem 0.4rem 1rem;">
      <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); text-align: center; margin-bottom: 0.3rem;">대화를 분석하고 있어요</div>
      <div id="tc-pg-stage" style="font-size: 0.86rem; color: var(--text-secondary); text-align: center; margin-bottom: 1.4rem;">대화를 읽는 중</div>
      <div style="display: flex; align-items: center; gap: 0.7rem;">
        <div style="flex: 1 1 auto; height: 12px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;"><div id="tc-pg-bar" style="height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, #4f8a6b, #6aa98a); transition: width .4s ease;"></div></div>
        <b id="tc-pg-pct" style="flex: 0 0 3rem; text-align: right; font-size: 1.05rem; color: var(--accent-primary);">0%</b>
      </div>
      <div id="tc-pg-eta" style="margin-top: 0.5rem; font-size: 0.78rem; color: var(--text-muted); text-align: center;"></div>
      <div style="margin-top: 1.6rem; padding: 0.8rem 0.95rem; border-radius: 14px; background: var(--bg-secondary); border: 1px solid var(--glass-border); font-size: 0.84rem; line-height: 1.65; color: var(--text-secondary);">
        <b style="color: var(--text-primary);">기다리지 않아도 돼요.</b> 이 화면을 닫거나 다른 앱에 다녀와도 분석은 계속돼요. 끝나면 알려 드리고, [대화 분석]을 다시 열면 결과가 보여요.
      </div>
      <button type="button" class="btn-secondary" style="width: 100%; margin-top: 0.8rem;" onclick="window.TalkCheck.close()">닫고 다른 것 하기</button>
    </div>`;
    clearInterval(this._pgT);
    const tick = () => {
      const j = this._job, bar = document.getElementById('tc-pg-bar');
      if (!j || j.state !== 'running' || !bar) { clearInterval(this._pgT); return; }
      const p = this._pct();
      bar.style.width = p + '%';
      const pe = document.getElementById('tc-pg-pct'); if (pe) pe.textContent = p + '%';
      const st = document.getElementById('tc-pg-stage');
      if (st) st.textContent = p < 18 ? '대화를 읽는 중' : p < 40 ? '있었던 일과 해석을 가르는 중' : p < 62 ? '양쪽을 같은 잣대로 평가하는 중' : p < 82 ? '네 가지 눈으로 보는 중' : '답장 초안을 쓰는 중';
      const eta = document.getElementById('tc-pg-eta');
      if (eta) { const el = Math.round((Date.now() - j.t0) / 1000); const left = p > 20 ? Math.max(3, Math.round(el * (100 - p) / p)) : Math.round(25 + j.chars / 600); eta.textContent = `${el}초 지났어요 · 약 ${left}초 남았어요`; }
    };
    tick(); this._pgT = setInterval(tick, 400);
  },

  // 실제 요청 — 답을 흘려 받으며(스트리밍) 받은 만큼 진행률을 올린다. 흘려 받기가 안 되면 통째로 받는다.
  async _exec() {
    const j = this._job; if (!j) return;
    j.tries++;
    let raw = '';
    const payload = { model: window.LLM.MODEL_HIGH || window.LLM.MODEL, messages: [{ role: 'user', content: j.prompt }], temperature: 0.2, max_tokens: 4500 };
    try {
      const base = (window.LLM.BACKEND_URL || '').replace(/\/+$/, '');
      if (!base || !window.ReadableStream) throw new Error('nostream');
      const ac = new AbortController(); const kill = setTimeout(() => ac.abort(), 240000);
      const r = await fetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ ...payload, stream: true, clientId: (window.App && window.App.clientId) ? window.App.clientId() : undefined }) });
      if (!r.ok || !r.body) { clearTimeout(kill); throw new Error('http' + r.status); }
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
          try { const o = JSON.parse(d); const c = o.choices && o.choices[0] && o.choices[0].delta && o.choices[0].delta.content; if (c) { raw += c; j.got = raw.length; if (!j.first) j.first = Date.now(); } } catch (e) {}
        }
      }
      clearTimeout(kill);
    } catch (e) {
      // 흘려 받다 끊겼거나(다른 앱에 다녀오면 끊길 수 있다) 안 되는 환경 — 통째로 한 번 더 받는다
      raw = '';
      try {
        const r2 = await window.LLM._chatCompletion(payload, 200000);
        if (r2 && r2.ok) { const d2 = await r2.json(); raw = ((d2.choices && d2.choices[0] && d2.choices[0].message.content) || '').trim(); }
      } catch (e2) {}
    }
    if (this._job !== j) return;                       // 그 사이 새 분석을 시작했다
    let res = null;
    try { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); if (s >= 0 && e > s) res = JSON.parse(raw.slice(s, e + 1)); } catch (e) { res = null; }
    if (!res || !Array.isArray(res.timeline)) {
      if (j.tries < 2) { j.t0 = Date.now(); j.got = 0; j.first = 0; return this._exec(); }      // 한 번은 조용히 다시
      j.state = 'fail';
      if (j.paid && window.Wallet && window.Wallet.refund) { try { window.Wallet.refund(j.paid, '대화 분석 실패 — 돌려 드림', { voidSpend: j.paidId }); } catch (e) {} j.paid = 0; }
      if (document.getElementById('talkcheck-ov')) {
        this._renderInput();
        const ta2 = document.getElementById('tc-text'); if (ta2) { ta2.value = j.raw || ''; this._changed(); }
        this._say('지금은 분석하지 못했어요. 잠시 뒤에 [분석하기]를 다시 눌러 주세요.');
      } else if (window.App && window.App.showRecordToast) window.App.showRecordToast('대화 분석을 끝내지 못했어요. 다시 시도해 주세요');
      return;
    }
    j.state = 'done';
    this._res = res; this._tab = 'ally';
    this._score1 = null; this._heatSel = null; this._tryText = ''; this._tryHtml = ''; this._step = 0; this._askLog = [];
    this._savePattern();
    if (document.getElementById('talkcheck-ov')) { j.seen = true; this._renderResult(); }
    else {
      // 화면을 닫아 둔 사이에 끝났다 — 알려 준다. [대화 분석]을 다시 열면 결과가 보인다.
      try { if (window.App && window.App.notify) window.App.notify('대화 분석이 끝났어요', '홈의 [대화 분석]을 열면 결과를 볼 수 있어요.', 'talkcheck'); } catch (e) {}
      if (window.App && window.App.showRecordToast) window.App.showRecordToast('대화 분석이 끝났어요 — [대화 분석]을 열어 보세요');
    }
  },

  _list(a) { return (Array.isArray(a) ? a : [a]).filter(Boolean); },

  // ── 결과: 다섯 걸음 ────────────────────────────────────────────────
  STEPS: ['한눈에', '사실과 해석', '객관 평가', '네 가지 눈', '답장', '결론과 행동'],
  _renderResult() {
    const b = this._body(), r = this._res, esc = this._esc.bind(this); if (!b || !r) return;
    const A = 'var(--accent-primary)';
    const card = 'background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 18px; padding: 1rem 1.05rem; margin-bottom: 0.8rem; box-shadow: 0 6px 18px -14px rgba(60,45,25,.35);';
    const h = (t2, c) => `<div style="font-size: 0.74rem; font-weight: 800; letter-spacing: 0.01em; color: ${c || A}; margin-bottom: 0.4rem;">${t2}</div>`;
    const lines = a2 => this._list(a2).map(x => `<p style="margin: 0 0 0.5rem; font-size: 0.93rem; line-height: 1.7; color: var(--text-primary);">${esc(x)}</p>`).join('');
    const bullets = (a2, c) => this._list(a2).map(x => `<div style="display: flex; gap: 0.5rem; margin-bottom: 0.45rem; font-size: 0.92rem; line-height: 1.65; color: var(--text-primary);"><span style="flex: 0 0 auto; width: 0.42rem; height: 0.42rem; margin-top: 0.6rem; border-radius: 50%; background: ${c || A};"></span><span>${esc(x)}</span></div>`).join('');
    const quote = (who, q, c) => `<div style="border-left: 3px solid ${c || 'var(--glass-border)'}; padding: 0.15rem 0 0.15rem 0.7rem; margin-bottom: 0.5rem;">${who ? `<div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted);">${esc(who)}</div>` : ''}<div style="font-size: 0.95rem; line-height: 1.6; color: var(--text-primary);">"${esc(q)}"</div></div>`;
    const hot = v => v >= 70 ? '#c0564f' : v >= 40 ? '#d98a4a' : '#6f97ab';
    const step = this._step = Math.max(0, Math.min(this.STEPS.length - 1, this._step || 0));

    // 걸음 표시
    const bar = `<div style="display: flex; gap: 4px; margin-bottom: 0.45rem;">${this.STEPS.map((s, i) => `<button type="button" aria-label="${s}" onclick="window.TalkCheck._to(${i})" style="all: unset; cursor: pointer; flex: 1 1 0; height: 5px; border-radius: 999px; background: ${i <= step ? A : `color-mix(in srgb, ${A} 16%, transparent)`};"></button>`).join('')}</div>
      <div style="display: flex; align-items: baseline; gap: 0.45rem; margin-bottom: 0.9rem;"><span style="font-size: 0.72rem; font-weight: 800; color: ${A};">${step + 1} / ${this.STEPS.length}</span><b style="font-size: 1.15rem; color: var(--text-primary);">${this.STEPS[step]}</b></div>`;

    const danger = r.danger ? `
      <div style="${card} border-color: #c0564f; background: color-mix(in srgb, #c0564f 8%, var(--bg-secondary));">
        ${h('먼저 확인해 주세요', '#c0564f')}
        <p style="margin: 0 0 0.5rem; font-size: 0.93rem; line-height: 1.65; color: var(--text-primary);">${esc(r.danger)}</p>
        <p style="margin: 0 0 0.5rem; font-size: 0.88rem; line-height: 1.6; color: var(--text-primary);">이런 일은 서로 조금씩 양보해서 풀 문제가 아니에요. 지금 안전한지가 먼저예요.</p>
        <div style="font-size: 0.86rem; line-height: 1.85; color: var(--text-primary);">· 위급하면 <b>112</b><br>· 여성긴급전화 <b>1366</b> (24시간, 가정폭력·성폭력·스토킹)<br>· 학교폭력 <b>117</b> · 청소년 <b>1388</b><br>· 직장 내 괴롭힘 고용노동부 <b>1350</b></div>
      </div>` : '';

    let body = '';
    // ① 한눈에 ────────────────────────────────────────────────────
    if (step === 0) {
      const hp = this._list(r.heat).filter(x => x && typeof x === 'object' && x.quote).slice(0, 12);
      let heatHtml = '';
      if (hp.length >= 3) {
        const W = 300, H = 110, pad = 14;
        const X = i => pad + (W - pad * 2) * i / (hp.length - 1);
        const Y = v => H - pad - (H - pad * 2) * Math.max(0, Math.min(100, +v || 0)) / 100;
        const pts = hp.map((p, i) => X(i).toFixed(1) + ',' + Y(p.t).toFixed(1));
        const top = hp.reduce((a2, p, i) => (+p.t > +hp[a2].t ? i : a2), 0);
        this._heatSel = this._heatSel == null || this._heatSel >= hp.length ? top : this._heatSel;
        const sel = hp[this._heatSel];
        heatHtml = `
          <div style="${card}">
            ${h('대화의 온도')}
            <svg viewBox="0 0 ${W} ${H}" style="width: 100%; height: auto; display: block;">
              <defs><linearGradient id="tcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c0564f" stop-opacity="0.22"/><stop offset="1" stop-color="#6f97ab" stop-opacity="0.03"/></linearGradient></defs>
              <polygon points="${pad},${H - pad} ${pts.join(' ')} ${W - pad},${H - pad}" fill="url(#tcg)"/>
              <line x1="${pad}" y1="${Y(70)}" x2="${W - pad}" y2="${Y(70)}" stroke="#c0564f" stroke-width="0.6" stroke-dasharray="3 3" opacity="0.55"/>
              <polyline points="${pts.join(' ')}" fill="none" stroke="var(--text-muted)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.75"/>
              ${hp.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.t).toFixed(1)}" r="13" fill="transparent" style="cursor: pointer;" onclick="window.TalkCheck._heatPick(${i})"/><circle cx="${X(i).toFixed(1)}" cy="${Y(p.t).toFixed(1)}" r="${i === this._heatSel ? 6.5 : 4.2}" fill="${/^나/.test(p.who || '') ? 'var(--accent-primary)' : hot(+p.t)}" stroke="#fff" stroke-width="${i === this._heatSel ? 2.2 : 1.2}" pointer-events="none"/>`).join('')}
            </svg>
            <div style="display: flex; justify-content: space-between; font-size: 0.66rem; color: var(--text-muted); margin: 0.15rem 0 0.55rem;"><span>처음</span><span>점선 위 = 서로 듣기 어려운 구간</span><span>끝</span></div>
            <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; border-radius: 12px; background: var(--bg-primary);">
              <b style="flex: 0 0 auto; font-size: 1.05rem; color: ${hot(+sel.t)};">${Math.round(+sel.t || 0)}°</b>
              <div style="min-width: 0;"><div style="font-size: 0.68rem; font-weight: 800; color: ${/^나/.test(sel.who || '') ? A : 'var(--text-muted)'};">${esc(sel.who || '')}</div><div style="font-size: 0.92rem; line-height: 1.5; color: var(--text-primary);">"${esc(sel.quote)}"</div></div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.4rem;">점을 누르면 그때 오간 말이 보여요. 초록 점이 내 말이에요.</div>
          </div>`;
      }
      const sp = r.spark || {};
      body = danger + `
        <div style="${card} background: linear-gradient(160deg, color-mix(in srgb, ${A} 13%, var(--bg-secondary)), var(--bg-secondary));">
          ${h('한 줄로 보면')}
          <p style="margin: 0; font-size: 1.08rem; font-weight: 700; line-height: 1.6; color: var(--text-primary);">${esc(r.one || r.start || '')}</p>
          ${r.pattern ? `<div style="margin-top: 0.65rem; display: inline-block; padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 0.76rem; font-weight: 700; color: ${A}; background: color-mix(in srgb, ${A} 12%, transparent);">${esc(r.pattern)}</div>` : ''}
        </div>
        ${heatHtml}
        ${sp.quote ? `<div style="${card}">
          ${h('불이 붙은 한마디', '#c0564f')}
          ${quote(sp.who, sp.quote, '#c0564f')}
          ${sp.why ? `<p style="margin: 0 0 0.7rem; font-size: 0.86rem; line-height: 1.6; color: var(--text-secondary);">${esc(sp.why)}</p>` : ''}
          ${(!r.danger && sp.instead) ? `<div style="padding: 0.65rem 0.8rem; border-radius: 12px; background: color-mix(in srgb, ${A} 9%, transparent);">
            <div style="font-size: 0.7rem; font-weight: 800; color: ${A}; margin-bottom: 0.2rem;">그때 이렇게 말했다면</div>
            <div style="font-size: 0.93rem; line-height: 1.6; color: var(--text-primary);">"${esc(sp.instead)}"</div></div>` : ''}
        </div>` : ''}`;
    }
    // ② 사실과 해석 ────────────────────────────────────────────────
    else if (step === 1) {
      const pr = this._list(r.pairs).filter(x => x && typeof x === 'object' && x.said);
      const st = this._stat;
      let statHtml = '';
      if (st && st.me.n + st.ot.n > 0) {
        const tot = st.me.n + st.ot.n, mp = Math.round(st.me.n / tot * 100);
        const row = (lab, a2, b2) => `<div style="display: flex; align-items: center; font-size: 0.84rem; padding: 0.26rem 0; color: var(--text-primary);"><span style="flex: 1 1 auto; color: var(--text-secondary);">${lab}</span><b style="flex: 0 0 3.4rem; text-align: right; color: ${A};">${a2}</b><b style="flex: 0 0 3.4rem; text-align: right; color: var(--text-muted);">${b2}</b></div>`;
        const notes = [];
        if (mp >= 65) notes.push('내가 훨씬 많이 말했어요. 상대가 말할 틈이 있었는지 돌아볼 만해요.');
        else if (mp <= 35) notes.push('상대가 훨씬 많이 말했어요. 하고 싶은 말을 다 못 했을 수 있어요.');
        if (st.me.abs + st.ot.abs >= 2) notes.push("'항상·매번·맨날' 같은 말은 한 번의 일을 그 사람 전체로 넓혀서, 듣는 쪽을 방어하게 만들어요.");
        if (st.me.sorry >= 3 && st.ot.sorry === 0) notes.push('사과는 나만 했어요. 내 몫이 아닌 것까지 떠안고 있지 않은지 다음 걸음의 [내 몫]에서 확인해 보세요.');
        statHtml = `<div style="${card}">
          ${h('숫자로 본 대화')}
          <div style="display: flex; height: 8px; border-radius: 999px; overflow: hidden; margin-bottom: 0.55rem; background: var(--bg-tertiary);"><span style="width: ${mp}%; background: ${A};"></span></div>
          <div style="display: flex; font-size: 0.7rem; font-weight: 800; padding-bottom: 0.25rem; border-bottom: 1px dashed var(--glass-border);"><span style="flex: 1 1 auto;"></span><span style="flex: 0 0 3.4rem; text-align: right; color: ${A};">나</span><span style="flex: 0 0 3.4rem; text-align: right; color: var(--text-muted);">상대</span></div>
          ${row('보낸 말', st.me.n + '개', st.ot.n + '개')}${row("'항상·매번·맨날'", st.me.abs + '번', st.ot.abs + '번')}${row('사과', st.me.sorry + '번', st.ot.sorry + '번')}${row('물음', st.me.q + '번', st.ot.q + '번')}
          ${notes.map(x => `<p style="margin: 0.5rem 0 0; font-size: 0.82rem; line-height: 1.6; color: var(--text-secondary);">${esc(x)}</p>`).join('')}
        </div>`;
      }
      const pairHtml = pr.map(x => `
        <div style="${card} padding: 0;">
          <div style="padding: 0.8rem 1rem;">${h('실제로 오간 말', 'var(--text-muted)')}<div style="font-size: 0.95rem; line-height: 1.6; color: var(--text-primary);">"${esc(x.said)}"</div></div>
          <div style="padding: 0.8rem 1rem; border-top: 1px dashed var(--glass-border); background: color-mix(in srgb, #d98a4a 8%, transparent);">${h('내가 읽은 뜻', '#d98a4a')}<div style="font-size: 0.93rem; line-height: 1.6; color: var(--text-primary);">${esc(x.read || '')}</div></div>
          ${x.alt ? `<div style="padding: 0.8rem 1rem; border-top: 1px dashed var(--glass-border); background: color-mix(in srgb, ${A} 8%, transparent); border-radius: 0 0 18px 18px;">${h('다르게 읽으면')}<div style="font-size: 0.93rem; line-height: 1.6; color: var(--text-primary);">${esc(x.alt)}</div></div>` : ''}
        </div>`).join('');
      body = `
        <p style="margin: 0 0 0.8rem; font-size: 0.86rem; line-height: 1.65; color: var(--text-secondary);">다툴 때 우리를 아프게 하는 건 상대의 말 그 자체보다, <b style="color: var(--text-primary);">그 말에 내가 붙인 뜻</b>일 때가 많아요. 둘을 나눠 볼게요.</p>
        ${pairHtml || (r.danger ? '' : `<div style="${card}"><p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">이 대화에서는 따로 짚을 만한 해석이 보이지 않았어요.</p></div>`)}
        ${r.gap ? `<div style="${card}">${h('서로 엇갈린 곳')}<p style="margin: 0; font-size: 0.93rem; line-height: 1.7; color: var(--text-primary);">${esc(r.gap)}</p></div>` : ''}
        ${statHtml}`;
    }
    // ③ 객관 평가 ────────────────────────────────────────────────
    else if (step === 2) {
      const au = r.audit || {};
      const LV = { good: ['#3d7659', '건강함'], mild: ['#8a7b68', '흔한 날 선 말'], concern: ['#d98a4a', '되풀이되면 해로움'], serious: ['#c0564f', '위험 신호'] };
      const VD = {
        danger: ['#c0564f', '위험 신호가 뚜렷해요', '이 대화에는 한 번이어도 가볍게 넘기면 안 되는 말·행동이 있어요.'],
        concern: ['#d98a4a', '걱정되는 패턴이 보여요', '한 번이면 다툼이지만, 되풀이된다면 나를 깎아내리는 관계일 수 있어요.'],
        ordinary: ['#3d7659', '흔한 다툼의 범위예요', '서로 날이 섰지만, 이 대화만 보면 위험한 관계의 신호는 뚜렷하지 않아요.'],
        myread: ['#6f97ab', '내 해석이 앞서 있을 수 있어요', '대화에 실제로 적힌 것보다 내가 읽어 넣은 뜻이 더 커 보여요.'],
        unknown: ['#8a7b68', '이 대화만으로는 판단하기 어려워요', '근거가 부족해요. 억지로 결론 내리지 않을게요.']
      };
      const vd = VD[au.verdict] || VD.unknown;
      const rows = (list, who) => {
        const a2 = this._list(list).filter(x => x && typeof x === 'object' && x.sign);
        if (!a2.length) return `<p style="margin: 0; font-size: 0.86rem; color: var(--text-secondary);">짚을 만한 것이 보이지 않았어요.</p>`;
        return a2.map(x => { const lv = LV[x.level] || LV.mild; return `
          <div style="padding: 0.55rem 0; border-top: 1px dashed var(--glass-border);">
            <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem;">
              <span style="flex: 0 0 auto; width: 0.55rem; height: 0.55rem; border-radius: 50%; background: ${lv[0]};"></span>
              <b style="font-size: 0.88rem; color: var(--text-primary);">${esc(x.sign)}</b>
              <span style="margin-left: auto; font-size: 0.66rem; font-weight: 800; color: ${lv[0]};">${lv[1]}</span>
            </div>
            ${x.quote ? `<div style="font-size: 0.86rem; line-height: 1.55; color: var(--text-secondary); padding-left: 0.95rem;">"${esc(x.quote)}"</div>` : ''}
          </div>`; }).join('');
      };
      const count = list => { const c = { serious: 0, concern: 0, mild: 0, good: 0 }; this._list(list).forEach(x => { if (x && c[x.level] != null) c[x.level]++; }); return c; };
      const meter = c => `<div style="display: flex; gap: 0.25rem; margin-top: 0.3rem;">${['serious', 'concern', 'mild', 'good'].map(k => c[k] ? `<span style="font-size: 0.68rem; font-weight: 800; padding: 0.12rem 0.5rem; border-radius: 999px; color: ${LV[k][0]}; background: color-mix(in srgb, ${LV[k][0]} 12%, transparent);">${LV[k][1]} ${c[k]}</span>` : '').join('')}</div>`;
      const serious = au.verdict === 'danger' || au.verdict === 'concern';
      body = `
        <div style="display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.75rem 0.9rem; margin-bottom: 0.8rem; border-radius: 14px; border: 1.5px solid #d98a4a; background: color-mix(in srgb, #d98a4a 9%, var(--bg-secondary));">
          <b style="flex: 0 0 auto; width: 1.4rem; height: 1.4rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; color: #fff; background: #d98a4a;">!</b>
          <div style="font-size: 0.82rem; line-height: 1.6; color: var(--text-primary);"><b>이 평가는 틀릴 수 있어요.</b> 한쪽이 넣은 이 대화만 보고 AI 가 한 것이에요. 사람을 판정하는 것이 아니라 <b>이 대화에 나타난 말과 행동</b>만 봤어요. 헤어짐·신고 같은 큰 결정을 이것만으로 하지 마세요.</div>
        </div>
        <div style="${card} border-color: ${vd[0]}; background: color-mix(in srgb, ${vd[0]} 7%, var(--bg-secondary));">
          ${h('이 대화만 놓고 보면', vd[0])}
          <p style="margin: 0 0 0.35rem; font-size: 1.12rem; font-weight: 800; line-height: 1.45; color: var(--text-primary);">${vd[1]}</p>
          <p style="margin: 0 0 0.5rem; font-size: 0.86rem; line-height: 1.6; color: var(--text-secondary);">${vd[2]}</p>
          ${au.verdictWhy ? `<p style="margin: 0; font-size: 0.92rem; line-height: 1.7; color: var(--text-primary);">${esc(au.verdictWhy)}</p>` : ''}
        </div>
        ${(() => {
          const tn = au.tone || {}; if (!tn.other && !tn.me) return '';
          const tcol = v => v >= 70 ? '#3d7659' : v >= 40 ? '#d98a4a' : '#c0564f';
          const tlab = v => v >= 80 ? '따뜻하고 예의 바름' : v >= 60 ? '대체로 존중함' : v >= 40 ? '날이 서 있음' : v >= 20 ? '무례함' : '막말에 가까움';
          const row = (who, o, c) => { if (!o) return ''; const v = Math.max(0, Math.min(100, +o.score || 0)); return `
            <div style="margin-bottom: 0.7rem;">
              <div style="display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.25rem;"><b style="font-size: 0.8rem; color: ${c};">${who}</b><span style="font-size: 0.78rem; font-weight: 700; color: ${tcol(v)};">${tlab(v)}</span><b style="margin-left: auto; font-size: 0.9rem; color: ${tcol(v)};">${Math.round(v)}</b></div>
              <div style="height: 8px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;"><span style="display: block; height: 100%; width: ${v}%; background: ${tcol(v)};"></span></div>
              ${o.desc ? `<div style="margin-top: 0.25rem; font-size: 0.84rem; line-height: 1.55; color: var(--text-secondary);">${esc(o.desc)}</div>` : ''}
            </div>`; };
          return `<div style="${card}">${h('말투 — 상대를 존중하는 정도')}${row('상대', tn.other, 'var(--text-muted)')}${row('나', tn.me, A)}<p style="margin: 0; font-size: 0.74rem; line-height: 1.5; color: var(--text-muted);">반말이나 짧은 말투는 감점하지 않았어요. 내용이 상대를 깎아내리는지로 봤어요.</p></div>`;
        })()}
        ${(() => {
          const tg = au.together || {}; const g = this._list(tg.good), hd = this._list(tg.hard);
          if (!g.length && !hd.length && !tg.say) return '';
          return `<div style="${card}">${h('함께 지내기에 — 이 대화에서 보인 신호')}
            ${g.length ? `<div style="font-size: 0.7rem; font-weight: 800; color: #3d7659; margin: 0.2rem 0 0.3rem;">좋은 신호</div>${bullets(g, '#3d7659')}` : ''}
            ${hd.length ? `<div style="font-size: 0.7rem; font-weight: 800; color: #c0564f; margin: 0.5rem 0 0.3rem;">힘든 신호</div>${bullets(hd, '#c0564f')}` : ''}
            ${tg.say ? `<p style="margin: 0.5rem 0 0; font-size: 0.9rem; line-height: 1.65; color: var(--text-primary);">${esc(tg.say)}</p>` : ''}
            <p style="margin: 0.5rem 0 0; font-size: 0.74rem; line-height: 1.5; color: var(--text-muted);">대화 한 번으로 사람을 다 알 수는 없어요. 같은 신호가 여러 번 되풀이되는지를 보세요.</p></div>`;
        })()}
        <div style="${card}">
          ${h('상대의 말과 행동', 'var(--text-muted)')}${meter(count(au.other))}
          <div style="margin-top: 0.5rem;">${rows(au.other)}</div>
        </div>
        <div style="${card}">
          ${h('나의 말과 행동')}${meter(count(au.me))}
          <div style="margin-top: 0.5rem;">${rows(au.me)}</div>
          <p style="margin: 0.5rem 0 0; font-size: 0.76rem; line-height: 1.55; color: var(--text-muted);">상대와 똑같은 잣대로 봤어요. 내 편을 들어 봐주지도, 일부러 깎지도 않았어요.</p>
        </div>
        ${au.bias ? `<div style="${card} border-color: #6f97ab;">${h('내 눈에 낀 것', '#6f97ab')}<p style="margin: 0; font-size: 0.92rem; line-height: 1.7; color: var(--text-primary);">${esc(au.bias)}</p></div>` : ''}
        ${serious ? `<div style="${card}">
          ${h('이럴 때는 혼자 판단하지 마세요', '#c0564f')}
          <div style="font-size: 0.88rem; line-height: 1.75; color: var(--text-primary);">· 이런 일이 <b>되풀이되는지</b> 날짜와 함께 적어 두세요. 한 번과 반복은 전혀 달라요.<br>· 믿을 만한 사람 한 명에게 이 대화를 그대로 보여 주고 어떻게 보이는지 물어보세요.<br>· 무섭거나 위협을 느낀다면 <b>112</b>, 여성긴급전화 <b>1366</b>(24시간), 직장이면 고용노동부 <b>1350</b>.</div>
        </div>` : ''}
        ${au.needMore ? `<p style="margin: 0 0 0.3rem; font-size: 0.8rem; line-height: 1.6; color: var(--text-secondary);"><b style="color: var(--text-primary);">더 확실히 알려면</b> · ${esc(au.needMore)}</p>` : ''}`;
    }
    // ④ 네 가지 눈 ────────────────────────────────────────────────
    else if (step === 3) {
      const TABS = r.danger ? [['ally', '내 편']] : [['ally', '내 편'], ['neutral', '나그네의 눈'], ['other', '상대의 자리'], ['mine', '내 몫']];
      if (!TABS.some(x => x[0] === this._tab)) this._tab = TABS[0][0];
      const tabBar = TABS.length > 1 ? `<div style="display: flex; gap: 0.3rem; margin-bottom: 0.7rem; padding: 0.25rem; border-radius: 14px; background: var(--bg-tertiary);">${TABS.map(x => `
        <button type="button" onclick="window.TalkCheck._go('${x[0]}')" style="all: unset; cursor: pointer; flex: 1 1 0; text-align: center; padding: 0.5rem 0.2rem; border-radius: 11px; font-size: 0.8rem; font-weight: 800; white-space: nowrap; color: ${this._tab === x[0] ? A : 'var(--text-secondary)'}; background: ${this._tab === x[0] ? 'var(--bg-secondary)' : 'transparent'}; box-shadow: ${this._tab === x[0] ? '0 2px 8px -4px rgba(60,45,25,.4)' : 'none'};">${x[1]}</button>`).join('')}</div>` : '';
      let pane = '';
      if (this._tab === 'ally') pane = h('내 마음이 그럴 만했던 이유') + lines(r.ally);
      else if (this._tab === 'neutral') pane = h('지나가는 사람이 본다면') + lines(r.neutral);
      else if (this._tab === 'other') {
        const nd = r.need || {};
        pane = h('상대가 오늘 일을 일기에 쓴다면') + `<div style="padding: 0.7rem 0.85rem 0.3rem; border-radius: 14px; background: var(--bg-primary); border: 1px solid var(--glass-border); margin-bottom: 0.5rem;">${lines(r.other)}</div>
          <p style="margin: 0 0 0.9rem; font-size: 0.74rem; color: var(--text-muted);">대화에서 드러난 것으로 짐작한 글이에요. 상대의 진짜 속마음은 알 수 없어요.</p>`
          + ((nd.me || nd.other) ? h('서로 정말 원했던 것') + `<div style="display: flex; gap: 0.5rem;">
              <div style="flex: 1 1 0; padding: 0.65rem 0.75rem; border-radius: 14px; background: color-mix(in srgb, ${A} 10%, transparent);"><div style="font-size: 0.68rem; font-weight: 800; color: ${A}; margin-bottom: 0.15rem;">나</div><div style="font-size: 0.9rem; line-height: 1.55; color: var(--text-primary);">${esc(nd.me || '')}</div></div>
              <div style="flex: 1 1 0; padding: 0.65rem 0.75rem; border-radius: 14px; background: var(--bg-tertiary);"><div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); margin-bottom: 0.15rem;">상대</div><div style="font-size: 0.9rem; line-height: 1.55; color: var(--text-primary);">${esc(nd.other || '')}</div></div></div>
            <p style="margin: 0.7rem 0 0; font-size: 0.82rem; line-height: 1.6; color: var(--text-secondary);">다툼은 대개 방법이 부딪힌 것이고, 원하는 것 자체는 함께 이룰 수 있을 때가 많아요.</p>` : '');
      } else {
        const m = r.mine || {};
        pane = h('내 몫이 아닌 것', 'var(--text-muted)') + bullets(m.not, 'var(--text-muted)') + '<div style="height: 0.6rem;"></div>'
          + h('다음에 내가 다르게 해 볼 수 있는 것') + (this._list(m.can).length ? bullets(m.can) : '<p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">이 대화에서는 딱히 보이지 않아요.</p>');
      }
      const lead = { ally: '먼저, 내 마음부터요.', neutral: '이번엔 한 걸음 떨어져서요.', other: '이번엔 상대의 자리에 앉아 봐요.', mine: '마지막으로, 내가 쥐고 있는 것만 골라내요.' }[this._tab];
      body = danger + tabBar + `<p style="margin: 0 0 0.6rem; font-size: 0.84rem; color: var(--text-secondary);">${lead}</p><div style="${card}">${pane}</div>`
        + (TABS.length > 1 ? `<p style="margin: 0; font-size: 0.76rem; line-height: 1.55; color: var(--text-muted);">네 가지를 다 읽어 보세요. 한 가지 눈으로만 보면 사람을 너무 믿게 되거나, 아예 믿지 않게 돼요.</p>` : '');
    }
    // ⑤ 답장 ────────────────────────────────────────────────────
    else if (step === 4) {
      const n = r.next || {};
      const draft = (label, t2) => t2 ? `<div style="${card} padding: 0.8rem 0.95rem;">
        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem;"><b style="flex: 1 1 auto; font-size: 0.76rem; color: ${A};">${label}</b>
          <button type="button" data-copy="${esc(t2)}" onclick="window.TalkCheck._copy(this)" style="all: unset; cursor: pointer; font-size: 0.74rem; font-weight: 700; padding: 0.3rem 0.8rem; border-radius: 999px; color: ${A}; background: color-mix(in srgb, ${A} 11%, transparent);">복사</button></div>
        <div style="font-size: 0.93rem; line-height: 1.65; color: var(--text-primary);">${esc(t2)}</div></div>` : '';
      const pa = (r.audit || {}).path || {};
      const PK = { distance: ['#c0564f', '거리를 두는 편이 나를 지켜요', '내가 예민해서가 아니에요. 이 대화의 말과 행동은 누구에게나 상처가 돼요.'],
        skill: ['#6f97ab', '사람을 끊기보다, 내 마음의 예민한 곳을 다뤄 봐요', '예민한 건 잘못이 아니에요. 다만 같은 말에 덜 다치는 법은 연습으로 배울 수 있어요.'],
        talk: ['#3d7659', '대화로 풀어 볼 만해요', '서로 원한 것은 달랐지만, 오해가 커진 쪽에 가까워요.'],
        both: ['#d98a4a', '거리도 조절하고, 내 마음도 같이 돌봐요', '상대의 말도 날이 섰고, 나도 크게 다쳤어요. 둘 다 손볼 만해요.'] };
      const pk = PK[pa.kind];
      const pathHtml = (pk && !r.danger) ? `<div style="${card} border-color: ${pk[0]}; background: color-mix(in srgb, ${pk[0]} 7%, var(--bg-secondary));">
          ${h('이 관계, 어느 쪽으로 가면 좋을까', pk[0])}
          <p style="margin: 0 0 0.3rem; font-size: 1.05rem; font-weight: 800; line-height: 1.5; color: var(--text-primary);">${pk[1]}</p>
          <p style="margin: 0 0 0.5rem; font-size: 0.84rem; line-height: 1.6; color: var(--text-secondary);">${pk[2]}</p>
          ${pa.why ? `<p style="margin: 0 0 0.5rem; font-size: 0.9rem; line-height: 1.7; color: var(--text-primary);">${esc(pa.why)}</p>` : ''}
          ${bullets(pa.steps, pk[0])}
          ${(pa.kind === 'skill' || pa.kind === 'both') ? `<div style="display: flex; gap: 0.4rem; margin-top: 0.5rem; flex-wrap: wrap;">
            <button type="button" class="btn-secondary" style="flex: 1 1 8rem; width: auto; font-size: 0.82rem;" onclick="window.TalkCheck._toHaru()">햇님과 그 생각 살펴보기</button>
            <button type="button" class="btn-secondary" style="flex: 1 1 8rem; width: auto; font-size: 0.82rem;" onclick="window.TalkCheck._toDal()">달님과 감정 가라앉히기</button></div>` : ''}
          <p style="margin: 0.5rem 0 0; font-size: 0.74rem; line-height: 1.5; color: var(--text-muted);">이 대화 한 번만 보고 한 제안이에요. 틀릴 수 있어요.</p>
        </div>` : '';
      body = danger + pathHtml + (r.danger ? '' : draft('부드럽게 풀고 싶을 때', n.soft)) + draft('내 입장을 분명히 할 때', n.firm) + draft('잠시 거리를 두고 싶을 때', n.space)
        + (n.wait ? `<div style="${card} background: var(--bg-tertiary); box-shadow: none;">${h('답하지 않는 것도 선택이에요', 'var(--text-secondary)')}<p style="margin: 0; font-size: 0.9rem; line-height: 1.65; color: var(--text-primary);">${esc(n.wait)}</p></div>` : '')
        + (r.danger ? '' : `<div style="${card}">
            ${h('보내기 전에, 미리 보내 보기')}
            <p style="margin: 0 0 0.5rem; font-size: 0.84rem; line-height: 1.6; color: var(--text-secondary);">보내려는 말을 적으면, 상대가 어떻게 받아들일지 먼저 봐 드려요.</p>
            <textarea id="tc-try" rows="3" maxlength="400" placeholder="보내려는 말을 그대로 적어 보세요" style="${this._field} line-height: 1.55; resize: vertical; background: var(--bg-primary);">${esc(this._tryText || '')}</textarea>
            <button type="button" class="btn-secondary" style="width: 100%; margin-top: 0.5rem;" onclick="window.TalkCheck._rehearse(this)">상대는 어떻게 받을까</button>
            <div id="tc-try-out" style="margin-top: 0.7rem;">${this._tryHtml || ''}</div>
          </div>`);
    }
    // ⑥ 결론과 행동 ────────────────────────────────────────────────
    else {
      const v = this._score1 == null ? this._score0 : this._score1;
      const pl = r.plan || {}, lv = pl.leave || {};
      const LS = { yes: ['#c0564f', '떠나는 쪽이 나를 지켜요'], consider: ['#d98a4a', '한 번 더 되풀이되면 떠날 준비를 하세요'], no: ['#3d7659', '떠날 일은 아니에요'] };
      const ls = LS[lv.should];
      const numbered = (a2, c) => this._list(a2).map((x, i) => `<div style="display: flex; gap: 0.55rem; margin-bottom: 0.5rem;"><span style="flex: 0 0 1.35rem; height: 1.35rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; color: #fff; background: ${c || A};">${i + 1}</span><span style="font-size: 0.93rem; line-height: 1.65; color: var(--text-primary);">${esc(x)}</span></div>`).join('');
      body = danger + `
        <div style="${card} background: linear-gradient(160deg, color-mix(in srgb, ${A} 14%, var(--bg-secondary)), var(--bg-secondary));">
          ${h('결론')}
          <p style="margin: 0; font-size: 1.12rem; font-weight: 800; line-height: 1.55; color: var(--text-primary);">${esc(pl.headline || (r.audit || {}).verdictWhy || r.one || '')}</p>
        </div>
        ${ls ? `<div style="${card} border-color: ${ls[0]}; background: color-mix(in srgb, ${ls[0]} 7%, var(--bg-secondary));">
          ${h('이 관계·이 자리에 계속 있을까', ls[0])}
          <p style="margin: 0 0 0.4rem; font-size: 1.05rem; font-weight: 800; line-height: 1.5; color: var(--text-primary);">${ls[1]}</p>
          ${lv.why ? `<p style="margin: 0 0 0.6rem; font-size: 0.92rem; line-height: 1.7; color: var(--text-primary);">${esc(lv.why)}</p>` : ''}
          ${this._list(lv.how).length ? `<div style="font-size: 0.72rem; font-weight: 800; color: ${ls[0]}; margin: 0.3rem 0 0.4rem;">떠난다면 이 순서로</div>${numbered(lv.how, ls[0])}` : ''}
        </div>` : ''}
        ${this._list(pl.now).length ? `<div style="${card}">${h('오늘 할 것')}${numbered(pl.now)}</div>` : ''}
        ${this._list(pl.week).length ? `<div style="${card}">${h('이번 주 안에')}${numbered(pl.week)}</div>` : ''}
        ${pl.line ? `<div style="${card} border-color: #d98a4a;">${h('미리 정해 둘 선', '#d98a4a')}<p style="margin: 0; font-size: 0.98rem; font-weight: 700; line-height: 1.6; color: var(--text-primary);">${esc(pl.line)}</p><p style="margin: 0.4rem 0 0; font-size: 0.78rem; line-height: 1.55; color: var(--text-muted);">선은 그 순간에 정하면 늦어요. 지금 정해 두면 그때 흔들리지 않아요.</p></div>` : ''}
        ${this._list(pl.evidence).length ? `<div style="${card}">${h('남겨 둘 것')}${bullets(pl.evidence)}</div>` : ''}
        ${this._list(pl.who).length ? `<div style="${card}">${h('도움 받을 곳')}${bullets(pl.who)}</div>` : ''}
        <div style="display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.7rem 0.9rem; margin-bottom: 0.8rem; border-radius: 14px; border: 1.5px solid #d98a4a; background: color-mix(in srgb, #d98a4a 9%, var(--bg-secondary));">
          <b style="flex: 0 0 auto; width: 1.3rem; height: 1.3rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #fff; background: #d98a4a;">!</b>
          <div style="font-size: 0.8rem; line-height: 1.6; color: var(--text-primary);">한쪽이 넣은 이 대화만 보고 AI 가 내린 결론이라 <b>틀릴 수 있어요.</b> 전학·이별·신고 같은 큰 결정은 믿을 만한 사람이나 전문가와 한 번 더 확인하고 움직이세요. ${r.limit ? esc(r.limit) : ''}</div>
        </div>
        <div style="${card}">
          ${h('대화에 안 담긴 사정이 있나요')}
          <p style="margin: 0 0 0.5rem; font-size: 0.84rem; line-height: 1.6; color: var(--text-secondary);">현실은 대화 한 토막보다 복잡해요. 전부터 있던 일, 말로 한 것, 이 사람과의 사이를 적어 주면 그것까지 넣어 다시 봐 드려요. 궁금한 걸 물어도 돼요.</p>
          <div id="tc-ask-log">${(this._askLog || []).map(x => `<div style="margin-bottom: 0.6rem;"><div style="font-size: 0.82rem; font-weight: 700; color: var(--accent-primary); margin-bottom: 0.15rem;">${esc(x.q)}</div><div style="font-size: 0.9rem; line-height: 1.7; color: var(--text-primary); white-space: pre-wrap;">${esc(x.a)}</div></div>`).join('')}</div>
          <textarea id="tc-ask" rows="3" maxlength="600" placeholder="예: 이 사람은 예전에도 약속을 세 번 어겼어요 / 제가 너무 예민한 건가요?" style="${this._field} line-height: 1.55; resize: vertical; background: var(--bg-primary);"></textarea>
          <button type="button" class="btn-secondary" style="width: 100%; margin-top: 0.5rem;" onclick="window.TalkCheck._ask(this)">이것까지 넣어 다시 보기</button>
        </div>
        ${(!r.danger && r.thought) ? `<div style="${card} border-color: #d98a4a;">
          ${h('이 일로 가장 무겁게 남은 생각', '#d98a4a')}
          <p style="margin: 0 0 0.6rem; font-size: 1rem; font-weight: 700; line-height: 1.55; color: var(--text-primary);">"${esc(r.thought)}"</p>
          <p style="margin: 0 0 0.75rem; font-size: 0.84rem; line-height: 1.6; color: var(--text-secondary);">행동과 별개로, 이 생각은 오래 남아 나를 깎아요. 햇님과 6단계로 직접 살펴볼 수 있어요.</p>
          <button type="button" class="btn-primary" style="width: 100%; padding: 0.75rem; background: #d98a4a;" onclick="window.TalkCheck._toHaru()">이 생각, 햇님과 살펴보기 ›</button>
        </div>` : ''}
        ${this._patternHtml()}
        <div style="${card}">
          ${h('지금 마음은 몇 점인가요')}
          <div style="display: flex; align-items: center; gap: 0.7rem; margin: 0.3rem 0 0.2rem;">
            <input type="range" min="0" max="100" step="5" value="${v}" oninput="window.TalkCheck._rerate(this.value)" style="flex: 1 1 auto; accent-color: ${A};">
            <b id="tc-re-v" style="flex: 0 0 2.8rem; text-align: right; font-size: 1.3rem; color: ${A};">${v}</b>
          </div>
          <div id="tc-re-msg" style="font-size: 0.86rem; line-height: 1.6; color: var(--text-secondary);">처음에는 ${this._score0}점이었어요. 무엇을 할지 정한 지금은 어떤가요?</div>
        </div>
        <p style="margin: 0 0 0.8rem; font-size: 0.74rem; line-height: 1.6; color: var(--text-muted);">대화 원문과 이 결과는 저장되지 않아요.</p>
        <button type="button" class="btn-secondary" style="width: 100%;" onclick="window.TalkCheck.open()">다른 대화 넣기</button>`;
    }

    const last = step === this.STEPS.length - 1;
    const nav = `<div style="position: sticky; bottom: -1rem; margin: 1rem -1rem -1rem; padding: 0.7rem 1rem calc(0.7rem + env(safe-area-inset-bottom)); display: flex; gap: 0.5rem; background: linear-gradient(180deg, transparent, var(--bg-primary) 30%);">
      ${step > 0 ? `<button type="button" class="btn-secondary" style="flex: 0 0 5.5rem; width: auto;" onclick="window.TalkCheck._to(${step - 1})">‹ 이전</button>` : ''}
      ${last ? '' : `<button type="button" class="btn-primary" style="flex: 1 1 auto; width: auto;" onclick="window.TalkCheck._to(${step + 1})">다음 · ${this.STEPS[step + 1]} ›</button>`}
    </div>`;
    b.innerHTML = bar + body + nav;
  },
  _to(i) { this._step = i; this._renderResult(); const b = this._body(); if (b) b.scrollTop = 0; },
  _heatPick(i) { this._heatSel = i; const b = this._body(); const y = b ? b.scrollTop : 0; this._renderResult(); if (b) b.scrollTop = y; },
  _rerate(v) {
    this._score1 = +v;
    const a = this._score0, el = document.getElementById('tc-re-v'), m = document.getElementById('tc-re-msg');
    if (el) el.textContent = v;
    if (m) m.textContent = +v < a ? `${a} → ${v}. ${a - v}점 내려갔어요. 일은 그대로인데 보는 눈이 넓어진 만큼 마음이 달라진 거예요.` : +v > a ? `${a} → ${v}. 더 올라왔네요. 그럴 수 있어요 — 아직 풀리지 않은 게 있다는 신호예요. 상담사와 더 이야기해 봐도 좋아요.` : `처음과 같은 ${a}점이에요. 바로 달라지지 않아도 괜찮아요.`;
  },
  // 자주 걸리는 생각 — 분석할 때마다 '가장 무겁게 하는 생각' 한 문장만 이 기기에 남긴다(대화 원문·결과는 남기지 않는다). 세 번 넘게 쌓이면 보여 준다.
  _savePattern() {
    const r = this._res; if (!r || !r.thought || r.danger || !window.Storage) return;
    const a = window.Storage._safeGet('cbt_talk_thoughts', []) || [];
    a.unshift({ t: String(r.thought).slice(0, 60), p: String(r.pattern || '').slice(0, 30), ts: Date.now() });
    window.Storage._safeSet('cbt_talk_thoughts', a.slice(0, 20));
  },
  _patternHtml() {
    const a = (window.Storage && window.Storage._safeGet('cbt_talk_thoughts', [])) || [];
    if (a.length < 3) return '';
    const esc = this._esc.bind(this);
    return `<div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 16px; padding: 0.9rem 1rem; margin-bottom: 0.8rem;">
      <div style="font-size: 0.72rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 0.35rem;">다툴 때마다 걸렸던 생각 (최근 ${Math.min(a.length, 5)}번)</div>
      ${a.slice(0, 5).map(x => `<div style="font-size: 0.86rem; line-height: 1.6; color: var(--text-primary);">· "${esc(x.t)}"${x.p ? ` <span style="font-size: 0.72rem; color: var(--text-muted);">${esc(x.p)}</span>` : ''}</div>`).join('')}
      <p style="margin: 0.5rem 0 0; font-size: 0.78rem; line-height: 1.55; color: var(--text-secondary);">비슷한 생각이 되풀이된다면, 상대가 바뀌어도 같은 자리에서 걸리고 있는 거예요. 그 생각 하나를 햇님과 살펴보면 여러 다툼이 한꺼번에 가벼워져요.</p>
      <button type="button" onclick="window.Storage._safeSet('cbt_talk_thoughts', []); window.TalkCheck._renderResult();" style="all: unset; cursor: pointer; margin-top: 0.4rem; font-size: 0.72rem; color: var(--text-muted); text-decoration: underline;">이 기록 지우기</button>
    </div>`;
  },
  // 답장 미리 보내 보기 — 보내려는 말을 상대가 어떻게 받을지
  async _rehearse(btn) {
    const ta = document.getElementById('tc-try'), out = document.getElementById('tc-try-out');
    const msg = (ta && ta.value || '').trim(); if (!msg || !out) return;
    this._tryText = msg;
    if (window.LLM && window.LLM.CRISIS_RE && window.LLM.CRISIS_RE.test(msg)) { out.innerHTML = '<p style="font-size: 0.84rem; color: #c0564f;">많이 힘드신 것 같아요. 지금은 답장보다 내 안전이 먼저예요. 자살예방상담전화 109, 정신건강상담전화 1577-0199 가 24시간 받아요.</p>'; return; }
    btn.disabled = true; btn.textContent = '읽어 보는 중…';
    const r = this._res || {};
    const ctx = `있었던 일: ${this._list(r.timeline).join(' / ')}\n엇갈린 곳: ${r.gap || ''}\n상대가 원한 것(짐작): ${(r.need || {}).other || ''}`;
    const prompt = `아래는 방금 다툰 대화의 요약입니다.\n${ctx}\n\n'나'가 상대방에게 보내려는 답장:\n"${msg}"\n\n상대방의 자리에서 이 답장을 읽어 보고, JSON 으로만 답하세요(한국어 존댓말, 문장은 짧게).\n{"soft": 0에서 100(부드럽게 들리는 정도), "clear": 0에서 100(내 뜻이 분명히 전해지는 정도), "feel": "상대가 이 말을 읽고 느낄 것 한 문장", "reply": "상대가 보낼 법한 답장 한 줄(상대의 평소 말투로)", "snag": "상대가 걸려 넘어질 표현이 있으면 그 표현과 이유 한 문장, 없으면 빈 문자열", "better": "같은 뜻을 지키면서 더 잘 전해지게 고친 답장(원래 말투 유지, 2~3문장). 고칠 것이 없으면 빈 문자열"}\n규칙: 뜻을 바꾸거나 무조건 사과하게 만들지 않습니다. 분명히 말해야 할 것을 흐리지 않습니다.`;
    let d = null;
    try {
      const res = await window.LLM._chatCompletion({ model: window.LLM.MODEL_HIGH || window.LLM.MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 700 }, 60000);
      if (res && res.ok) { const j = await res.json(); const raw = ((j.choices && j.choices[0] && j.choices[0].message.content) || ''); const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); if (s >= 0 && e > s) d = JSON.parse(raw.slice(s, e + 1)); }
    } catch (e) { d = null; }
    if (!document.getElementById('tc-try-out')) return;
    const esc = this._esc.bind(this);
    if (!d) { this._tryHtml = '<p style="font-size: 0.82rem; color: #c14a4a;">지금은 읽어 보지 못했어요. 잠시 뒤에 다시 눌러 주세요.</p>'; }
    else {
      const bar = (lab, v) => `<div style="flex: 1 1 0;"><div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-secondary);"><span>${lab}</span><b style="color: var(--text-primary);">${Math.round(+v || 0)}</b></div><div style="height: 6px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;"><span style="display: block; height: 100%; width: ${Math.max(0, Math.min(100, +v || 0))}%; background: var(--accent-primary);"></span></div></div>`;
      this._tryHtml = `
        <div style="display: flex; gap: 0.7rem; margin-bottom: 0.55rem;">${bar('부드럽게 들림', d.soft)}${bar('뜻이 분명함', d.clear)}</div>
        ${d.feel ? `<p style="margin: 0 0 0.4rem; font-size: 0.86rem; line-height: 1.6; color: var(--text-primary);"><b style="font-size: 0.72rem; color: var(--accent-primary);">상대가 느낄 것</b><br>${esc(d.feel)}</p>` : ''}
        ${d.reply ? `<p style="margin: 0 0 0.4rem; font-size: 0.86rem; line-height: 1.6; color: var(--text-primary);"><b style="font-size: 0.72rem; color: var(--accent-primary);">돌아올 법한 답</b><br>"${esc(d.reply)}"</p>` : ''}
        ${d.snag ? `<p style="margin: 0 0 0.4rem; font-size: 0.86rem; line-height: 1.6; color: var(--text-primary);"><b style="font-size: 0.72rem; color: #d98a4a;">걸릴 수 있는 곳</b><br>${esc(d.snag)}</p>` : ''}
        ${d.better ? `<div style="border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.6rem 0.75rem; background: var(--bg-primary);"><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem;"><b style="flex: 1 1 auto; font-size: 0.74rem; color: var(--accent-primary);">이렇게 고치면</b><button type="button" data-copy="${esc(d.better)}" onclick="window.TalkCheck._copy(this)" style="all: unset; cursor: pointer; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 999px; color: var(--text-secondary); background: var(--bg-tertiary);">복사</button></div><div style="font-size: 0.88rem; line-height: 1.6; color: var(--text-primary);">${esc(d.better)}</div></div>` : '<p style="margin: 0; font-size: 0.82rem; color: var(--text-secondary);">이대로 보내도 뜻이 잘 전해질 것 같아요.</p>'}`;
    }
    const b = this._body(); const y = b ? b.scrollTop : 0; this._renderResult(); if (b) b.scrollTop = y;
  },
  _go(t) { this._tab = t; const b = this._body(); const y = b ? b.scrollTop : 0; this._renderResult(); if (b) b.scrollTop = y; },
  _copy(el) {
    const t = el.dataset.copy || '';
    const done = () => { el.textContent = '복사됨'; setTimeout(() => { if (el.isConnected) el.textContent = '복사'; }, 1500); };
    try { navigator.clipboard.writeText(t).then(done, () => {}); } catch (e) {}
  },
  // 덧붙인 사정·질문을 넣어 다시 본다 — 원래 대화와 첫 평가를 같이 주고, 평가가 달라지는지까지 답하게 한다
  async _ask(btn) {
    const ta = document.getElementById('tc-ask'); const q = (ta && ta.value || '').trim(); if (!q) return;
    if (window.LLM && window.LLM.CRISIS_RE && window.LLM.CRISIS_RE.test(q)) { this.close(); const inp = document.getElementById('chat-input'); if (inp && window.App) { window.App.switchTab('chat', true); inp.value = q; window.App.sendMessage(); } return; }
    btn.disabled = true; btn.textContent = '다시 보는 중…';
    const r = this._res || {}, j = this._job || {}, au = r.audit || {};
    const prev = (this._askLog || []).map(x => `사용자: ${x.q}
답: ${x.a}`).join(' / ');
    const prompt = `당신은 사람들 사이의 다툼을 풀어 보는 일을 돕는 상담 전문가입니다. 아래 대화를 이미 한 번 평가했습니다.

[대화]
${String(j.transcript || '').slice(-12000)}

[첫 평가] 판정: ${au.verdict || ''} — ${au.verdictWhy || ''} / 권한 방향: ${(au.path || {}).kind || ''} / 엇갈린 곳: ${r.gap || ''}
${prev ? `[앞서 주고받은 것] ${prev}` : ''}
[사용자가 덧붙인 사정 또는 질문]
${q}

이것까지 넣어 다시 봅니다. 한국어 존댓말로, 짧은 문단 2~4개(문단 사이 빈 줄), 한 문장 45자 안팎으로 답하세요.
- 덧붙인 사정이 평가를 바꾸면 무엇이 어떻게 바뀌는지 분명히 말합니다(예: 한 번이면 다툼이지만 세 번 되풀이됐다면 걱정되는 패턴). 바뀌지 않으면 왜 그대로인지 말합니다.
- 사용자의 말은 한쪽의 기억이라는 점을 잊지 않되, 의심하는 말투로 쓰지 않습니다.
- "제가 예민한가요?" 같은 질문에는 예·아니오로 자르지 말고, 이 대화에서 누구에게나 아플 부분과 유독 크게 다친 부분을 나눠서 답합니다.
- 사람에게 꼬리표나 진단명을 붙이지 않습니다. 위험(폭력·협박·스토킹·통제)이 보이면 안전이 먼저라고 말하고 112·1366 을 알려 줍니다.
- 마지막에 지금 해 볼 한 가지를 권합니다.`;
    let a = '';
    try { const res = await window.LLM._chatCompletion({ model: window.LLM.MODEL_HIGH || window.LLM.MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 900 }, 90000); if (res && res.ok) { const d = await res.json(); a = ((d.choices && d.choices[0] && d.choices[0].message.content) || '').trim(); } } catch (e) {}
    if (!a) { btn.disabled = false; btn.textContent = '이것까지 넣어 다시 보기'; if (window.App && window.App.showRecordToast) window.App.showRecordToast('지금은 답하지 못했어요. 다시 눌러 주세요'); return; }
    this._askLog = (this._askLog || []).concat([{ q, a }]).slice(-6);
    const b = this._body(); const y = b ? b.scrollTop : 0; this._renderResult(); if (b) b.scrollTop = y;
  },
  _toDal() {
    this.close();
    if (!window.App || !window.Personas) return;
    try { window.Personas.setActive('dalnim'); if (window.App.updatePersonaBar) window.App.updatePersonaBar(); } catch (e) {}
    window.App.switchTab('chat', true);
    const inp = document.getElementById('chat-input');
    if (inp) { inp.value = '달님, 달빛 상담 시작할게요. 방금 다툰 일로 마음이 많이 올라와 있어요. 1단계부터 이끌어 주세요.'; window.App.sendMessage(); }
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
