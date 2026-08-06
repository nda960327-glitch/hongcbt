// ============================================================================
//  마음 응급처치 — 불안·공황이 밀려올 때 즉시 쓰는 안정화 도구
//  · 박스 호흡(4-4-4-4) / 4-7-8 호흡: 원이 커졌다 작아지는 가이드
//  · 5-4-3-2-1 그라운딩: 감각으로 지금-여기에 닻 내리기 (DBT/MBCT)
//  전부 오프라인 동작. 위기 모달·홈·AI 추천에서 진입한다.
// ============================================================================
window.Calm = {
  _timer: null,
  _cycles: 0,

  openMenu() {
    this._overlay(`
      <div style="text-align: center; max-width: 300px;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('empathy', 96) : ''}</span>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.3rem;">마음 응급처치</h2>
        <p style="font-size: 0.85rem; opacity: 0.85; margin: 0 0 1.4rem;">지금 마음이 요동친다면,<br>우렁이랑 잠깐 가라앉혀봐요.</p>
        <button onclick="window.Calm.startBreath('box')" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.9rem; border-radius: 14px; background: rgba(255,255,255,0.14); font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-bottom: 0.6rem;">🫧 박스 호흡 (4·4·4·4)<br><span style="font-size: 0.72rem; font-weight: 400; opacity: 0.75;">긴장·불안을 가라앉히는 기본 호흡</span></button>
        <button onclick="window.Calm.startBreath('478')" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.9rem; border-radius: 14px; background: rgba(255,255,255,0.14); font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-bottom: 0.6rem;">🌙 4·7·8 호흡<br><span style="font-size: 0.72rem; font-weight: 400; opacity: 0.75;">잠들기 전, 격한 감정 진정에</span></button>
        <button onclick="window.Calm.startGrounding()" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.9rem; border-radius: 14px; background: rgba(255,255,255,0.14); font-weight: 700; font-size: 0.95rem; cursor: pointer; margin-bottom: 0.6rem;">🖐️ 5·4·3·2·1 그라운딩<br><span style="font-size: 0.72rem; font-weight: 400; opacity: 0.75;">생각의 소용돌이에서 지금-여기로</span></button>
        <button onclick="window.Calm.close(); window.SleepSounds && window.SleepSounds.open()" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.9rem; border-radius: 14px; background: rgba(255,255,255,0.14); font-weight: 700; font-size: 0.95rem; cursor: pointer;">🌧️ 수면 사운드<br><span style="font-size: 0.72rem; font-weight: 400; opacity: 0.75;">빗소리·파도·백색소음과 함께 잠들기</span></button>
      </div>`);
  },

  // --- 호흡 가이드 ---
  startBreath(mode) {
    const phases = mode === '478'
      ? [['코로 들이쉬세요', 4, 1.55], ['그대로 멈추세요', 7, 1.55], ['입으로 길게 내쉬세요', 8, 0.72]]
      : [['들이쉬세요', 4, 1.55], ['멈추세요', 4, 1.55], ['내쉬세요', 4, 0.72], ['멈추세요', 4, 0.72]];
    this._cycles = 0;

    this._overlay(`
      <div style="text-align: center;">
        <div style="position: relative; width: 230px; height: 230px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
          <div id="calm-circle" style="position: absolute; width: 130px; height: 130px; border-radius: 50%; background: radial-gradient(circle, rgba(174,207,182,0.85) 0%, rgba(174,207,182,0.25) 70%); transform: scale(0.72); transition: transform 3.8s ease-in-out;"></div>
          <span style="position: relative; line-height: 0;">${window.Stickers ? window.Stickers.svg('sleepy', 84) : ''}</span>
        </div>
        <h2 id="calm-phase" style="margin: 1rem 0 0.2rem; font-size: 1.25rem;">준비…</h2>
        <p id="calm-count" style="margin: 0; font-size: 2rem; font-weight: 800; color: #f5c74e;"></p>
        <p id="calm-cycles" style="margin: 0.8rem 0 0; font-size: 0.8rem; opacity: 0.7;">숨이 오가는 것만 바라보세요</p>
      </div>`);

    let pi = 0;
    const runPhase = () => {
      if (!document.getElementById('calm-phase')) return; // 닫힘
      const [label, secs, scale] = phases[pi];
      document.getElementById('calm-phase').textContent = label;
      const circle = document.getElementById('calm-circle');
      circle.style.transitionDuration = secs + 's';
      circle.style.transform = `scale(${scale})`;
      if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
      if (window.App && window.App._tone) window.App._tone(pi % 2 === 0 ? 520 : 392, 0.25, 0, 0.05);

      let left = secs;
      document.getElementById('calm-count').textContent = left;
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        left--;
        const cnt = document.getElementById('calm-count');
        if (!cnt) { clearInterval(this._timer); return; }
        if (left <= 0) {
          clearInterval(this._timer);
          pi = (pi + 1) % phases.length;
          if (pi === 0) {
            this._cycles++;
            const cy = document.getElementById('calm-cycles');
            if (cy) cy.textContent = `${this._cycles}번째 호흡 완료 · 편해질 때까지 계속해요`;
            // 호흡 1사이클을 끝까지 마쳤을 때만 연습 1회로 집계 (뱃지용)
            if (this._cycles === 1 && window.Growth) window.Growth.bumpBreath();
          }
          runPhase();
        } else {
          cnt.textContent = left;
        }
      }, 1000);
    };
    setTimeout(runPhase, 600);
  },

  // --- 5-4-3-2-1 그라운딩 ---
  startGrounding() {
    const steps = [
      ['👀', '지금 눈에 보이는 것', '5가지', '천천히 둘러보며 하나씩 마음속으로 이름 붙여보세요'],
      ['🖐️', '몸에 닿아 있는 감촉', '4가지', '옷의 무게, 의자의 단단함, 발바닥의 바닥…'],
      ['👂', '지금 들리는 소리', '3가지', '멀리서 나는 소리까지 귀 기울여보세요'],
      ['👃', '지금 맡을 수 있는 냄새', '2가지', '없다면 좋아하는 냄새 두 가지를 떠올려도 좋아요'],
      ['👅', '지금 느껴지는 맛', '1가지', '물 한 모금도 좋아요. 천천히.']
    ];
    let i = 0;
    const render = () => {
      const s = steps[i];
      this._overlay(`
        <div style="text-align: center; max-width: 300px;">
          <p style="font-size: 0.78rem; opacity: 0.7; margin: 0 0 0.8rem;">${i + 1} / 5 · 그라운딩</p>
          <div style="font-size: 3.2rem; margin-bottom: 0.6rem;">${s[0]}</div>
          <h2 style="margin: 0 0 0.2rem; font-size: 1.25rem;">${s[1]}</h2>
          <p style="font-size: 1.6rem; font-weight: 800; color: #f5c74e; margin: 0.2rem 0 0.6rem;">${s[2]}</p>
          <p style="font-size: 0.85rem; opacity: 0.85; line-height: 1.6; margin: 0 0 1.4rem;">${s[3]}</p>
          <button id="calm-next" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.85rem; border-radius: 999px; background: #f2ede4; color: #2e4237; font-weight: 800; cursor: pointer;">${i < 4 ? '찾았어요, 다음 ›' : '마쳤어요'}</button>
        </div>`);
      document.getElementById('calm-next').addEventListener('click', () => {
        if (i < 4) { i++; render(); }
        else this._finish();
      });
    };
    render();
  },

  _finish() {
    if (window.Growth) window.Growth.bumpBreath();
    this._overlay(`
      <div style="text-align: center; max-width: 300px;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('proud', 110) : ''}</span>
        <h2 style="margin: 0.8rem 0 0.4rem; font-size: 1.3rem;">잘 돌아왔어요</h2>
        <p style="font-size: 0.88rem; opacity: 0.85; line-height: 1.6; margin: 0 0 1.4rem;">방금 당신은 요동치는 마음을<br>스스로 가라앉혔어요. 그거, 아무나 못해요.</p>
        <button onclick="window.Calm.close(); window.App.switchTab('chat');" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.85rem; border-radius: 999px; background: #f2ede4; color: #2e4237; font-weight: 800; cursor: pointer; margin-bottom: 0.5rem;">우렁이한테 이야기하러 가기</button>
        <button onclick="window.Calm.close()" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.7rem; font-size: 0.82rem; opacity: 0.75; cursor: pointer;">닫기</button>
      </div>`);
  },

  _overlay(inner) {
    this.close(true);
    const ov = document.createElement('div');
    ov.id = 'calm-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10003; background: linear-gradient(180deg, #33493d 0%, #1f2f26 100%); color: #f2ede4; display: flex; align-items: center; justify-content: center; padding: 2rem 1.4rem;';
    ov.innerHTML = inner + `<button onclick="window.Calm.close()" style="all: unset; position: absolute; top: 1rem; right: 1.2rem; font-size: 1.4rem; cursor: pointer; opacity: 0.7; padding: 0.3rem;">✕</button>`;
    document.body.appendChild(ov);
  },

  close(keepTimer) {
    if (!keepTimer) { clearInterval(this._timer); this._timer = null; }
    const ov = document.getElementById('calm-overlay');
    if (ov) ov.remove();
  }
};
