// 실습 카드 — 햇님(CBT)·달님(DBT)의 6단계를 채팅창 안에서 '직접 해 보며' 배우는 카드.
//  이 두 상담사는 오래 수다를 떠는 상담사가 아니다. 단계마다 무엇을 왜 하는지 짧게 배우고, 사용자가 카드에 직접 적고 고른 뒤 보낸다.
//  · 상담사의 답장 첫 줄 "[n/6] …" 단계 표시가 오면 js/llm.js 가 그 단계의 카드를 답장 아래에 붙인다 ([그림:실습|상담사|단계]).
//  · [보내기]를 누르면 "[실습 3/6 · 감정 이름·강도 매기기] …" 형태의 글이 사용자의 말로 전송된다 — 상담사는 그걸 받아 짧게 짚고 다음 단계로 간다.
//  카드의 내용(배우기 한 줄·입력 칸)은 아래 DEFS 에 있다. 칸 종류: area(글) · chips(고르기) · slider(0~100) · check(해 보며 표시) · pick(설명 딸린 고르기) · timer(초)
(function () {
  const EMO = ['불안', '우울', '화', '서러움', '억울함', '외로움', '수치심', '죄책감', '무기력', '두려움', '질투', '허무함'];
  const DEFS = {
    haru: {
      name: '햇살 상담', total: 6,
      steps: [
        { t: '상황 떠올리기', learn: '인지행동치료는 막연한 기분이 아니라 한 장면에서 시작해요. 사진을 찍듯, 해석 없이 있었던 일만 적어요.',
          f: [{ k: '언제', type: 'line', ph: '예: 어제 오후 회의 때' }, { k: '어디서·누구와', type: 'line', ph: '예: 회의실, 팀장님과 팀원들' }, { k: '있었던 일', type: 'area', ph: '예: 발표 중에 팀장님이 한숨을 쉬었다', req: 1 }] },
        { t: '자동적 사고 붙잡기', learn: '기분을 만든 건 사건이 아니라 그 순간 스친 생각이에요. 문장으로 붙잡아야 살펴볼 수 있어요.',
          f: [{ k: '그 순간 스친 생각', type: 'area', ph: '머릿속에 지나간 말을 그대로', req: 1, eg: ['다 내 잘못이야', '나를 싫어하나 봐', '또 망했어', '난 왜 이것밖에 안 될까'] }, { k: '그 생각을 믿는 정도', type: 'slider', v: 80 }] },
        { t: '감정 이름·강도 매기기', learn: '감정에 이름을 붙이면 뇌가 한 걸음 물러서요. 점수를 매겨 두면 나중에 얼마나 달라졌는지 볼 수 있어요.',
          f: [{ k: '감정', type: 'chips', opts: EMO, max: 3, req: 1, custom: 1 }, { k: '강도', type: 'slider', v: 70, heat: 1 }] },
        { t: '증거 검토하기', learn: '생각은 사실이 아니라 가설이에요. 재판하듯 양쪽 증거를 모아 봐요. 느낌·추측은 증거가 아니에요.',
          f: [{ k: '그 생각이 맞다는 증거', type: 'area', ph: '실제로 있었던 사실만' }, { k: '맞지 않다는 증거', type: 'area', ph: '친한 친구가 같은 일을 겪었다면 뭐라고 말해 줄까요?', req: 1 }] },
        { t: '인지왜곡 찾기', learn: '마음이 힘들 때 생각은 정해진 몇 가지 함정에 빠져요. 이름을 알면 다음에 금방 알아차릴 수 있어요.',
          f: [{ k: '내 생각에 숨은 함정', type: 'pick', max: 2, req: 1, opts: [
            ['흑백논리', '완벽하지 않으면 실패라고 본다'], ['과잉일반화', '한 번의 일을 "항상·절대"로 넓힌다'], ['독심술', '확인 없이 남의 속마음을 단정한다'], ['재앙화', '가장 나쁜 결과가 올 거라고 본다'],
            ['개인화', '내 탓이 아닌 것까지 내 탓으로 돌린다'], ['감정적 추론', '그렇게 느끼니까 사실이라고 믿는다'], ['당위 진술', '"~해야만 해"로 나를 몰아붙인다'], ['긍정 격하', '잘한 일은 별것 아니라고 깎는다']] }] },
        { t: '균형 잡힌 생각 만들기', learn: '억지 긍정이 아니에요. 양쪽 증거를 모두 담은, 더 정확한 문장을 만드는 거예요.',
          f: [{ k: '새로 만든 생각', type: 'area', ph: '예: 한숨은 내 발표 때문이 아닐 수도 있다. 준비한 건 다 전달했다', req: 1 }, { k: '지금 감정 강도', type: 'slider', v: 40, heat: 1 }] }
      ]
    },
    dalnim: {
      name: '달빛 상담', total: 6,
      steps: [
        { t: '감정 온도 재기', learn: '감정이 클 때는 먼저 이름을 붙이고 온도를 재요. 지금 무엇을 다루는지 알아야 가라앉힐 수 있어요.',
          f: [{ k: '지금 가장 큰 감정', type: 'chips', opts: EMO, max: 2, req: 1, custom: 1 }, { k: '온도', type: 'slider', v: 75, heat: 1 }] },
        { t: '멈추기 (STOP)', learn: '감정이 시키는 대로 바로 움직이면 후회가 남아요. 네 가지를 순서대로 해 보면서 눌러 주세요.',
          f: [{ k: '해 본 것', type: 'check', req: 1, opts: ['멈췄어요 — 하던 것을 그대로 멈춤', '한 걸음 물러나 숨을 한 번 길게', '몸·생각·상황을 살펴봄', '나에게 도움이 되는 쪽을 골라 봄'] }, { k: '충동대로 하면 5분 뒤에는', type: 'line', ph: '예: 보내고 나서 후회할 것 같다' }] },
        { t: '몸으로 온도 낮추기', learn: '감정 온도가 높을 때는 생각보다 몸이 먼저예요. 하나를 골라 1분만 해 보고 온도를 다시 재요.',
          f: [{ k: '고른 방법', type: 'chips', max: 1, req: 1, opts: ['찬물로 얼굴 적시기', '제자리에서 빠르게 움직이기', '숨 길게 내쉬기(4초 들이쉬고 6초 내쉬기)', '주먹 꽉 쥐었다 풀기'], note: '심장·혈압이 걱정되면 찬물은 건너뛰어요' }, { k: '1분 해 보기', type: 'timer', sec: 60 }, { k: '하고 난 뒤 온도', type: 'slider', v: 60, heat: 1 }] },
        { t: '감정 파도 타기', learn: '감정은 파도처럼 올라왔다가 반드시 내려가요. 밀어내지도 붙잡지도 않고 몸에서 느껴지는 대로 지켜봐요.',
          f: [{ k: '몸 어디에서 느껴지나요', type: 'chips', max: 3, req: 1, opts: ['가슴', '목', '배', '머리', '어깨', '손', '얼굴'] }, { k: '어떤 느낌인가요', type: 'line', ph: '예: 꽉 조이는 느낌, 뜨거움, 울렁거림' }, { k: '90초 지켜보기', type: 'timer', sec: 90 }, { k: '지금 온도', type: 'slider', v: 50, heat: 1 }] },
        { t: '반대로 해보기', learn: '감정이 시키는 행동이 지금 도움이 안 된다면, 그 반대의 아주 작은 행동이 감정을 바꿔요. 감정이 상황에 맞다면 반대로 하지 않아요.',
          f: [{ k: '감정이 시키는 행동', type: 'chips', max: 2, req: 1, custom: 1, opts: ['숨기', '쏘아붙이기', '포기하기', '연락 끊기', '물건 던지기', '폭식·폭음'] }, { k: '그 행동이 지금 도움이 되나요', type: 'chips', max: 1, req: 1, opts: ['도움이 안 돼요', '잘 모르겠어요', '지금 상황에 맞는 감정이에요'] }, { k: '반대의 작은 행동', type: 'line', ph: '예: 숨는 대신 친구에게 문자 한 줄' }] },
        { t: '오늘의 한 걸음', learn: '기술은 한 번 써 본 것으로 끝나지 않아요. 다음 파도가 올 때 가장 먼저 할 일을 정해 두면 그때 떠올릴 수 있어요.',
          f: [{ k: '다음에도 쓸 기술', type: 'chips', max: 2, req: 1, opts: ['감정 온도 재기', '멈추기', '찬물·긴 날숨', '파도 타기', '반대로 해보기'] }, { k: '파도가 오면 가장 먼저 할 일', type: 'line', ph: '예: 화장실에 가서 찬물로 손을 씻는다', req: 1 }, { k: '지금 온도', type: 'slider', v: 35, heat: 1 }] }
      ]
    }
  };

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const heat = n => n >= 70 ? '#c0564f' : n >= 40 ? '#d98a4a' : '#6f97ab';
  let seq = 0;

  function fieldHtml(f, i, col) {
    const lab = `<div style="font-size: 0.74rem; font-weight: 800; color: var(--text-primary); margin: 0.6rem 0 0.3rem;">${esc(f.k)}${f.req ? ` <span style="color: ${col};">*</span>` : ''}</div>`;
    const inputCss = `width: 100%; box-sizing: border-box; font: inherit; font-size: 0.86rem; color: var(--text-primary); background: var(--bg-primary); border: 1.5px solid var(--glass-border); border-radius: 10px; padding: 0.5rem 0.65rem;`;
    if (f.type === 'line') return lab + `<input data-wf="${i}" type="text" maxlength="80" placeholder="${esc(f.ph || '')}" style="${inputCss}">`;
    if (f.type === 'area') {
      const eg = (f.eg || []).map(e => `<button type="button" data-eg="${esc(e)}" onclick="window.WorkCards.eg(this)" style="all: unset; cursor: pointer; font-size: 0.7rem; padding: 0.18rem 0.5rem; border-radius: 999px; color: var(--text-muted); border: 1px dashed var(--glass-border);">${esc(e)}</button>`).join('');
      return lab + `<textarea data-wf="${i}" rows="2" maxlength="300" placeholder="${esc(f.ph || '')}" style="${inputCss} resize: vertical; line-height: 1.5;"></textarea>`
        + (eg ? `<div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3rem;"><span style="font-size: 0.66rem; color: var(--text-muted); align-self: center;">예시</span>${eg}</div>` : '');
    }
    if (f.type === 'slider') return lab + `<div style="display: flex; align-items: center; gap: 0.6rem;">
        <input data-wf="${i}" data-heat="${f.heat ? 1 : 0}" type="range" min="0" max="100" step="5" value="${f.v == null ? 50 : f.v}" oninput="window.WorkCards.slide(this)" style="flex: 1 1 auto; accent-color: ${col};">
        <b data-wv style="flex: 0 0 2.6rem; text-align: right; font-size: 0.95rem; color: ${f.heat ? heat(f.v == null ? 50 : f.v) : col};">${f.v == null ? 50 : f.v}</b></div>
        <div style="display: flex; justify-content: space-between; font-size: 0.62rem; color: var(--text-muted);"><span>0 전혀</span><span>50 꽤</span><span>100 최고로</span></div>`;
    if (f.type === 'chips' || f.type === 'check') {
      const col2 = f.type === 'check';
      const chip = o => `<button type="button" data-chip="${esc(o)}" onclick="window.WorkCards.chip(this)" aria-pressed="false"
        style="all: unset; box-sizing: border-box; cursor: pointer; ${col2 ? 'display: block; width: 100%; border-radius: 10px; padding: 0.45rem 0.65rem;' : 'border-radius: 999px; padding: 0.32rem 0.7rem;'} font-size: 0.8rem; font-weight: 600; color: var(--text-primary); border: 1.5px solid var(--glass-border); background: var(--bg-primary);">${col2 ? '<span data-ck style="display: inline-block; width: 1rem;">○</span> ' : ''}${esc(o)}</button>`;
      return lab + `<div data-wf="${i}" data-max="${col2 ? 99 : (f.max || 1)}" style="display: flex; flex-wrap: wrap; gap: 0.3rem;${col2 ? ' flex-direction: column;' : ''}">${f.opts.map(chip).join('')}
        ${f.custom ? `<input data-custom type="text" maxlength="12" placeholder="직접 입력" style="flex: 0 0 6rem; box-sizing: border-box; font: inherit; font-size: 0.78rem; color: var(--text-primary); background: var(--bg-primary); border: 1.5px dashed var(--glass-border); border-radius: 999px; padding: 0.28rem 0.7rem;">` : ''}</div>`
        + (f.note ? `<div style="font-size: 0.66rem; color: var(--text-muted); margin-top: 0.25rem;">${esc(f.note)}</div>` : '')
        + (!col2 && (f.max || 1) > 1 ? `<div style="font-size: 0.66rem; color: var(--text-muted); margin-top: 0.25rem;">${f.max}개까지 고를 수 있어요</div>` : '');
    }
    if (f.type === 'pick') return lab + `<div data-wf="${i}" data-max="${f.max || 1}" style="display: flex; flex-direction: column; gap: 0.3rem;">${f.opts.map(o => `
        <button type="button" data-chip="${esc(o[0])}" onclick="window.WorkCards.chip(this)" aria-pressed="false" style="all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; border-radius: 10px; padding: 0.42rem 0.65rem; border: 1.5px solid var(--glass-border); background: var(--bg-primary);">
          <b style="font-size: 0.8rem; color: var(--text-primary);">${esc(o[0])}</b><span style="font-size: 0.72rem; color: var(--text-muted);"> — ${esc(o[1])}</span></button>`).join('')}</div>
        <div style="font-size: 0.66rem; color: var(--text-muted); margin-top: 0.25rem;">${f.max || 1}개까지 고를 수 있어요</div>`;
    if (f.type === 'timer') return lab + `<button type="button" data-wf="${i}" data-sec="${f.sec}" data-done="0" onclick="window.WorkCards.timer(this)"
        style="all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; text-align: center; border-radius: 10px; padding: 0.5rem; font-size: 0.82rem; font-weight: 800; color: ${col}; border: 1.5px solid ${col}; background: color-mix(in srgb, ${col} 8%, transparent);">${f.sec}초 시작</button>`;
    return '';
  }

  window.WorkCards = {
    DEFS,
    has(pid, n) { return !!(DEFS[pid] && DEFS[pid].steps[n - 1]); },
    render(args) {
      const pid = String((args || [])[0] || ''), n = parseInt((args || [])[1], 10) || 0;
      const d = DEFS[pid], st = d && d.steps[n - 1];
      if (!st) return '';
      const col = (window.Personas && window.Personas.get(pid) && window.Personas.get(pid).color) || 'var(--accent-primary)';
      const id = 'wk' + (++seq);
      const dots = d.steps.map((s, i) => `<span style="flex: 1 1 0; height: 4px; border-radius: 999px; background: ${i < n ? col : `color-mix(in srgb, ${col} 18%, transparent)`};"></span>`).join('');
      return `
      <div id="${id}" data-work="${esc(pid)}:${n}" style="width: min(100%, 330px); min-width: 250px; padding: 0.1rem 0 0.2rem;">
        <div style="display: flex; gap: 3px; margin-bottom: 0.5rem;">${dots}</div>
        <div style="display: flex; align-items: baseline; gap: 0.4rem;">
          <span style="font-size: 0.66rem; font-weight: 800; color: #fff; background: ${col}; border-radius: 999px; padding: 0.1rem 0.5rem;">실습 ${n}/${d.total}</span>
          <b style="font-size: 0.92rem; color: var(--text-primary);">${esc(st.t)}</b>
        </div>
        <div style="margin-top: 0.45rem; padding: 0.5rem 0.65rem; border-radius: 10px; font-size: 0.76rem; line-height: 1.55; color: var(--text-primary); background: color-mix(in srgb, ${col} 9%, transparent);"><b style="color: ${col};">배우기</b> · ${esc(st.learn)}</div>
        ${st.f.map((f, i) => fieldHtml(f, i, col)).join('')}
        <button type="button" data-go onclick="window.WorkCards.submit(this)" style="all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; text-align: center; margin-top: 0.8rem; padding: 0.6rem; border-radius: 12px; font-size: 0.88rem; font-weight: 800; color: #fff; background: ${col};">적은 것 보내기 ›</button>
        <div data-err style="display: none; margin-top: 0.35rem; font-size: 0.72rem; color: #c14a4a; text-align: center;"></div>
      </div>`;
    },
    // 돌아보기 카드 — 여섯 단계에서 내가 적은 것을 한 장에. 처음과 끝의 점수 변화가 한눈에 보인다.
    summary(args) {
      const pid = String((args || [])[0] || ''), d = DEFS[pid]; if (!d) return '';
      let log = null; try { log = (JSON.parse(localStorage.getItem('cbt_work_log') || '{}'))[pid]; } catch (e) {}
      if (!log || !log.s) return '';
      const col = (window.Personas && window.Personas.get(pid) && window.Personas.get(pid).color) || 'var(--accent-primary)';
      const score = lines => { for (const l of (lines || []).slice().reverse()) { if (/(강도|온도)/.test(l)) { const m = l.match(/(\d+)점/); if (m) return +m[1]; } } return null; };
      const firstN = pid === 'haru' ? 3 : 1;
      const a = score(log.s[firstN]), b = score(log.s[d.total]);
      const rows = d.steps.map((st, i) => { const ls = log.s[i + 1]; if (!ls) return ''; return `
        <div style="display: flex; gap: 0.5rem; padding: 0.4rem 0; border-top: 1px dashed color-mix(in srgb, ${col} 30%, transparent);">
          <span style="flex: 0 0 1.2rem; height: 1.2rem; border-radius: 50%; background: ${col}; color: #fff; font-size: 0.64rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;">${i + 1}</span>
          <div style="min-width: 0;"><div style="font-size: 0.7rem; font-weight: 800; color: ${col};">${esc(st.t)}</div>${ls.map(l => `<div style="font-size: 0.78rem; line-height: 1.5; color: var(--text-primary); overflow-wrap: anywhere;">${esc(l)}</div>`).join('')}</div>
        </div>`; }).join('');
      const change = (a != null && b != null) ? `
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.6rem; margin: 0.5rem 0 0.6rem; padding: 0.55rem; border-radius: 12px; background: color-mix(in srgb, ${col} 9%, transparent);">
          <div style="text-align: center;"><div style="font-size: 0.62rem; color: var(--text-muted);">처음</div><b style="font-size: 1.25rem; color: ${heat(a)};">${a}</b></div>
          <span style="font-size: 1rem; color: var(--text-muted);">→</span>
          <div style="text-align: center;"><div style="font-size: 0.62rem; color: var(--text-muted);">지금</div><b style="font-size: 1.25rem; color: ${heat(b)};">${b}</b></div>
          <b style="font-size: 0.8rem; color: ${b < a ? '#3d7659' : 'var(--text-muted)'};">${b < a ? '▼ ' + (a - b) + '점 내려갔어요' : b === a ? '그대로예요' : '▲ ' + (b - a) + '점'}</b>
        </div>` : '';
      const learned = pid === 'haru'
        ? '사건은 그대로인데, 생각을 다시 보니 감정 점수가 달라졌어요. 감정을 만드는 건 사건이 아니라 그 순간의 생각이라는 걸 직접 확인한 거예요.'
        : '감정을 없애려 하지 않았는데도 온도가 달라졌어요. 이름 붙이고, 멈추고, 몸을 먼저 가라앉히면 파도는 지나간다는 걸 직접 확인한 거예요.';
      return `
      <div style="width: min(100%, 330px); min-width: 250px; padding: 0.1rem 0 0.2rem;">
        <div style="font-size: 0.66rem; font-weight: 800; color: ${col};">${esc(d.name)} · 오늘의 기록</div>
        <b style="display: block; font-size: 0.95rem; color: var(--text-primary); margin: 0.15rem 0 0.2rem;">내 마음이 지나온 길</b>
        ${change}${rows}
        <div style="margin-top: 0.55rem; padding: 0.5rem 0.65rem; border-radius: 10px; font-size: 0.76rem; line-height: 1.55; color: var(--text-primary); background: color-mix(in srgb, ${col} 9%, transparent);"><b style="color: ${col};">오늘 배운 것</b> · ${learned}</div>
      </div>`;
    },
    _root(el) { return el.closest('[data-work]'); },
    _col(root) { const pid = root.dataset.work.split(':')[0]; return (window.Personas && window.Personas.get(pid) && window.Personas.get(pid).color) || '#4f8a6b'; },
    slide(el) { const v = el.parentNode.querySelector('[data-wv]'); if (v) { v.textContent = el.value; if (el.dataset.heat === '1') v.style.color = heat(+el.value); } },
    eg(el) { const ta = el.closest('div').previousElementSibling; if (ta && !ta.disabled) { ta.value = el.dataset.eg; ta.focus(); } },
    chip(el) {
      const box = el.parentNode, root = this._root(el); if (!root || root.dataset.sent) return;
      const max = +box.dataset.max || 1, col = this._col(root), on = el.getAttribute('aria-pressed') === 'true';
      const set = (b, v) => { b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.style.borderColor = v ? col : 'var(--glass-border)'; b.style.background = v ? `color-mix(in srgb, ${col} 14%, transparent)` : 'var(--bg-primary)'; const ck = b.querySelector('[data-ck]'); if (ck) ck.textContent = v ? '●' : '○'; };
      if (on) { set(el, false); return; }
      const picked = [...box.querySelectorAll('[data-chip][aria-pressed="true"]')];
      if (max === 1) picked.forEach(b => set(b, false));
      else if (picked.length >= max) return;
      set(el, true);
      if (window.Sfx) window.Sfx.play('pop');
    },
    timer(el) {
      const root = this._root(el); if (!root || root.dataset.sent || el.dataset.run === '1') return;
      let left = +el.dataset.sec || 60; el.dataset.run = '1';
      const tick = () => {
        if (!el.isConnected) return;
        if (left <= 0) { el.textContent = '했어요 ✓'; el.dataset.done = '1'; el.dataset.run = '0'; if (window.Sfx) window.Sfx.play('pop'); return; }
        el.textContent = left + '초 남았어요 — 천천히'; left--; setTimeout(tick, 1000);
      };
      tick();
    },
    submit(btn) {
      const root = this._root(btn); if (!root || root.dataset.sent) return;
      const [pid, ns] = root.dataset.work.split(':'), n = +ns, d = DEFS[pid], st = d.steps[n - 1];
      const err = root.querySelector('[data-err]'), lines = [];
      for (let i = 0; i < st.f.length; i++) {
        const f = st.f[i], el = root.querySelector(`[data-wf="${i}"]`); let v = '';
        if (f.type === 'line' || f.type === 'area') v = String(el.value || '').trim().replace(/\s*\n\s*/g, ' / ');
        else if (f.type === 'slider') v = el.value + '점';
        else if (f.type === 'timer') v = el.dataset.done === '1' ? '끝까지 했어요' : '';
        else { const a = [...el.querySelectorAll('[data-chip][aria-pressed="true"]')].map(b => b.dataset.chip); const c = el.querySelector('[data-custom]'); if (c && c.value.trim()) a.push(c.value.trim()); v = a.join(', '); }
        if (f.req && !v) { err.textContent = `'${f.k}'을(를) 채워 주세요`; err.style.display = 'block'; return; }
        if (v) lines.push(f.k + ': ' + v);
      }
      err.style.display = 'none';
      root.dataset.sent = '1';
      root.querySelectorAll('input, textarea, button').forEach(x => { x.disabled = true; x.style.pointerEvents = 'none'; });
      btn.textContent = '보냈어요 ✓'; btn.style.opacity = '0.55';
      const inp = document.getElementById('chat-input');
      if (!inp || !window.App) return;
      if (window.Sfx) window.Sfx.play('pop');
      // 단계마다 적은 것을 모아 둔다 — 6단계를 마치면 한 장으로 돌아본다(summary)
      try {
        const all = JSON.parse(localStorage.getItem('cbt_work_log') || '{}');
        if (n === 1 || !all[pid]) all[pid] = { ts: Date.now(), s: {} };
        all[pid].s[n] = lines; all[pid].ts = Date.now();
        localStorage.setItem('cbt_work_log', JSON.stringify(all));
      } catch (e) {}
      inp.value = `[실습 ${n}/${d.total} · ${st.t}]\n` + lines.join('\n');
      window.App.sendMessage();
    }
  };
})();
