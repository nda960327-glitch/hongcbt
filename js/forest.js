// ============================================================================
//  솔숲 명상 — 소나무 상담사의 MBCT(마음챙김 기반 인지치료) 따라 하기
//
//  채팅이 아니라 몸으로 하는 연습이다. 8주 코스 + 6가지 연습.
//   · 귀: 미리 녹음한 안내 음성(audio/forest/*.mp3, tools/forest-tts.mjs 로 만든다)
//         + 앱이 직접 만드는 배경음(솔바람·빗소리·시냇물·싱잉볼, WebAudio) + 단계마다 종소리
//         음성 파일이 없으면 폰의 음성 합성, 그것도 없으면 글로만 안내한다.
//   · 눈: 단계마다 바뀌는 숲→새벽 색, 숨 쉬는 구슬, 바디스캔 몸 지도, 소리 물결, 생각 구름
//   · 손: 종이 울릴 때와 들숨 시작에 짧은 진동(안드로이드)
//   · 혀·코: 한 입 명상(먹기) 은 보고·만지고·냄새 맡고·맛보는 순서를 그대로 따라간다
//  기록은 기기에만(cbt_forest_log). 소나무와의 대화에는 최근 연습만 짧게 알려준다.
//
//  스크립트 한 줄 = [안내 문장, 문장 뒤 고요한 시간(초), 화면 신호]
//   신호: bell 종 · breath 숨 구슬 · body:부위 · whole 몸 전체 · sense:see|touch|smell|taste|hear
//         ripple 소리 물결 · cloud 생각 구름 · walk 발자국 · end 마무리 종
//  문장을 고치면 tools/forest-tts.mjs 를 다시 돌려 음성을 새로 만든다 (파일 이름이 문장 해시라 바뀐 줄만 새로 만든다).
// ============================================================================
window.Forest = {
  LOG_KEY: 'cbt_forest_log',
  PREF_KEY: 'cbt_forest_pref',
  AUDIO_BASE: 'audio/forest/',

  PRACTICES: {
    space: {
      name: '3분 호흡 공간', min: 4, hue: 150,
      what: '하루 중 언제든 3단계로 멈춰 서기 — 알아차리고, 모으고, 넓히기. MBCT에서 가장 자주 쓰는 연습이에요.',
      lines: [
        ['허리를 곧게 펴고, 편안하게 앉아 보세요. 눈은 감아도 좋고, 앞쪽 바닥에 살짝 내려 두어도 좋아요.', 4, 'bell'],
        ['첫 번째 단계입니다. 지금 이 순간, 내 안에서 무슨 일이 일어나고 있는지 알아차려 봅니다.', 3],
        ['어떤 생각들이 지나가고 있나요. 좋다 나쁘다 판단하지 않고, 그저 생각이 있구나, 하고 알아봅니다.', 9],
        ['어떤 기분이 느껴지나요. 불편한 느낌이 있다면 밀어내지 말고, 그 자리에 있는 그대로 둡니다.', 9],
        ['몸에서는 어떤 감각이 느껴지나요. 긴장이든, 무거움이든, 따뜻함이든, 무엇이든 괜찮아요.', 9],
        ['두 번째 단계입니다. 이제 주의를 한데 모아, 숨 쉬는 배로 가져갑니다.', 3, 'breath'],
        ['숨이 들어올 때 배가 부풀고, 숨이 나갈 때 가라앉는 것을 느껴 봅니다.', 12, 'breath'],
        ['숨 하나하나를 따라가며, 지금 여기에 닻을 내립니다. 마음이 딴 데로 가면, 부드럽게 다시 숨으로 돌아옵니다.', 22, 'breath'],
        ['세 번째 단계입니다. 이제 알아차림을 넓혀서, 숨과 함께 몸 전체를 느껴 봅니다.', 3, 'whole'],
        ['앉아 있는 자세, 얼굴의 표정, 몸 전체가 숨 쉬고 있는 것을 느껴 보세요.', 14, 'whole'],
        ['불편한 곳이 있다면, 숨을 그곳으로 보내듯 들이쉬고, 내쉬면서 조금 풀어 줍니다.', 14, 'whole'],
        ['이 넓어진 알아차림을, 다음 순간으로 가지고 갑니다. 준비가 되면, 천천히 눈을 뜨세요.', 4, 'end']
      ]
    },
    body: {
      name: '바디스캔', min: 15, hue: 165,
      what: '발끝에서 머리끝까지 주의를 천천히 옮기며 몸을 있는 그대로 느끼기. 누워서 해도 좋아요.',
      lines: [
        ['편안하게 눕거나 앉아 보세요. 이 시간은 무언가를 잘 해내는 시간이 아니라, 그저 느껴 보는 시간입니다.', 5, 'bell'],
        ['몸이 바닥이나 의자에 닿아 있는 곳을 느껴 봅니다. 몸의 무게가 아래로 내려앉는 것을 허락해 주세요.', 12, 'whole'],
        ['숨이 들고 나는 것을 몇 번 느껴 봅니다. 숨을 바꾸려 하지 않고, 그냥 지켜봅니다.', 15, 'breath'],
        ['이제 주의를 왼쪽 발가락으로 가져갑니다. 발가락 하나하나, 닿는 느낌, 따뜻함이나 차가움, 아무 느낌이 없어도 괜찮아요.', 25, 'body:lfoot'],
        ['왼발 바닥과 발등, 발목으로 주의를 넓혀 봅니다.', 20, 'body:lfoot'],
        ['왼쪽 종아리와 무릎, 허벅지로 천천히 올라옵니다. 느껴지는 그대로 알아차립니다.', 30, 'body:lleg'],
        ['이제 왼쪽 다리를 내려놓고, 오른쪽 발가락으로 주의를 옮깁니다.', 20, 'body:rfoot'],
        ['오른발 바닥, 발등, 발목을 느껴 봅니다.', 20, 'body:rfoot'],
        ['오른쪽 종아리와 무릎, 허벅지를 느껴 봅니다. 긴장이 있다면, 날숨과 함께 조금 내려놓습니다.', 30, 'body:rleg'],
        ['골반과 엉덩이, 바닥에 닿아 있는 느낌을 알아차립니다.', 25, 'body:pelvis'],
        ['허리와 등으로 주의를 옮깁니다. 불편한 곳이 있다면 고치려 하지 말고, 호기심을 가지고 들여다봅니다.', 30, 'body:back'],
        ['배로 옵니다. 숨 쉴 때마다 배가 부풀고 가라앉는 움직임을 느껴 봅니다.', 30, 'body:belly'],
        ['가슴으로 옵니다. 숨이 드나드는 느낌, 심장이 뛰는 느낌이 있다면 그것도 느껴 봅니다.', 30, 'body:chest'],
        ['양손의 손가락 끝, 손바닥, 손등으로 주의를 옮깁니다. 공기가 닿는 느낌, 저릿함, 따뜻함을 느껴 봅니다.', 25, 'body:hands'],
        ['손목에서 팔꿈치, 위팔까지 양팔을 느껴 봅니다.', 25, 'body:arms'],
        ['어깨로 옵니다. 많은 긴장이 모이는 곳이에요. 숨을 내쉬며 어깨가 조금 내려가도록 둡니다.', 30, 'body:shoulders'],
        ['목의 앞과 뒤, 목구멍을 느껴 봅니다.', 20, 'body:neck'],
        ['얼굴로 옵니다. 턱, 입술, 뺨, 눈 주위, 이마. 힘이 들어간 곳이 있다면 부드럽게 풀어 줍니다.', 30, 'body:face'],
        ['정수리까지 주의를 올려 봅니다.', 15, 'body:head'],
        ['이제 몸 전체를 한꺼번에 느껴 봅니다. 발끝부터 머리끝까지, 숨 쉬고 있는 하나의 몸을요.', 40, 'whole'],
        ['주의가 자꾸 흩어졌더라도 괜찮아요. 알아차리고 돌아온 순간마다, 이미 연습을 잘 하고 있었던 거예요.', 10, 'whole'],
        ['손가락과 발가락을 조금씩 움직여 보고, 준비가 되면 천천히 눈을 뜹니다.', 5, 'end']
      ]
    },
    breath: {
      name: '호흡 명상', min: 10, hue: 190,
      what: '숨을 닻 삼아 머무르기. 마음이 떠나는 걸 알아차리고 돌아오는 것, 그것이 연습의 전부예요.',
      lines: [
        ['등을 곧게, 그러나 딱딱하지 않게 세우고 앉아 봅니다. 위엄 있으면서도 편안한 자세로요.', 5, 'bell'],
        ['몸이 앉아 있는 느낌, 발이 바닥에 닿은 느낌을 먼저 느껴 봅니다.', 12, 'whole'],
        ['이제 숨이 가장 잘 느껴지는 곳을 찾아봅니다. 코끝이든, 가슴이든, 배든 괜찮아요.', 12, 'breath'],
        ['들숨이 시작되는 순간부터 끝날 때까지, 날숨이 시작되는 순간부터 끝날 때까지, 따라가 봅니다.', 30, 'breath'],
        ['숨을 조절하려 하지 않습니다. 몸이 알아서 숨 쉬도록 두고, 우리는 지켜보기만 합니다.', 40, 'breath'],
        ['어느새 생각이 떠올라 숨을 잊었다면, 그걸 알아차린 순간이 바로 깨어난 순간이에요.', 5, 'breath'],
        ['어디로 갔었는지 살짝 알아보고, 스스로를 탓하지 않고, 부드럽게 다시 숨으로 돌아옵니다.', 45, 'breath'],
        ['백 번 떠나도, 백 번 돌아오면 됩니다. 그 돌아옴이 마음의 근육을 키워요.', 50, 'breath'],
        ['혹시 힘든 감정이나 불편한 감각이 올라왔다면, 밀어내지 말고 이렇게 말해 봅니다. 괜찮아, 이미 여기 있구나. 느껴 봐도 괜찮아.', 30, 'breath'],
        ['그 감각이 있는 곳으로 숨을 보내듯 들이쉬고, 내쉬면서 그 자리에 공간을 조금 만들어 줍니다.', 40, 'breath'],
        ['이제 알아차림을 넓혀, 숨 쉬는 몸 전체를 느껴 봅니다.', 40, 'whole'],
        ['오늘 이 시간을 나에게 내어 준 것에 고마워하며, 준비가 되면 천천히 눈을 뜹니다.', 5, 'end']
      ]
    },
    sounds: {
      name: '소리와 생각', min: 12, hue: 215,
      what: '소리가 오고 가듯 생각도 오고 간다는 것을 보기. "생각은 사실이 아니다"를 몸으로 배우는 연습이에요.',
      lines: [
        ['편안하게 앉아, 숨 몇 번으로 지금 여기에 도착합니다.', 20, 'bell'],
        ['이제 주의를 소리로 옮깁니다. 소리를 찾아 나서지 않고, 소리가 나에게 오도록 기다립니다.', 20, 'ripple'],
        ['가까운 소리, 먼 소리, 큰 소리, 작은 소리. 소리와 소리 사이의 조용함도 들어 봅니다.', 35, 'ripple'],
        ['이건 차 소리, 이건 새소리, 하고 이름 붙이는 대신, 소리의 크기와 높이, 결을 그대로 들어 봅니다.', 35, 'ripple'],
        ['좋아하는 소리, 싫은 소리가 있다면, 좋다 싫다 하는 마음이 일어나는 것도 알아차립니다.', 30, 'ripple'],
        ['이제 소리를 내려놓고, 같은 방식으로 생각을 바라봅니다. 생각이 떠오르고, 머물다, 사라지는 것을요.', 15, 'cloud'],
        ['생각을 하늘에 떠가는 구름처럼 바라봅니다. 떠오른 생각을 아래 칸에 적어 보내도 좋아요.', 40, 'cloud'],
        ['어떤 생각은 크고 어둡고, 어떤 생각은 가볍게 지나갑니다. 구름을 잡거나 밀어내지 않고, 하늘로서 지켜봅니다.', 45, 'cloud'],
        ['생각은 마음에서 일어나는 사건일 뿐, 꼭 사실은 아닙니다. 나는 틀렸어, 하는 생각도 그저 지나가는 구름이에요.', 40, 'cloud'],
        ['생각에 휩쓸려 이야기 속으로 들어갔다면, 아, 생각이구나, 하고 이름 붙이고 다시 바라보는 자리로 돌아옵니다.', 45, 'cloud'],
        ['마지막으로 숨으로 돌아와, 몇 번의 숨과 함께 몸 전체를 느껴 봅니다.', 25, 'breath'],
        ['준비가 되면, 천천히 눈을 뜨고, 주위의 소리와 함께 돌아옵니다.', 5, 'end']
      ]
    },
    eat: {
      name: '한 입 명상', min: 7, hue: 30,
      what: '건포도·견과·초콜릿 한 조각을 처음 보는 것처럼. 자동조종을 벗어나 오감을 깨우는 첫 연습이에요.',
      prep: '작은 먹을거리 하나를 준비해 주세요. 건포도, 견과 한 알, 초콜릿 한 조각 무엇이든 좋아요.',
      lines: [
        ['준비한 먹을거리를 손바닥 위에 올려 봅니다. 마치 다른 별에서 와서, 이것을 처음 보는 것처럼요.', 5, 'bell'],
        ['먼저 눈으로 봅니다. 색깔, 빛이 비치는 곳과 그늘진 곳, 주름이나 결을 천천히 살펴봅니다.', 25, 'sense:see'],
        ['손가락으로 만져 봅니다. 무게, 단단함, 말랑함, 표면의 느낌을 느껴 봅니다. 눈을 감으면 더 잘 느껴져요.', 25, 'sense:touch'],
        ['코 가까이 가져가 냄새를 맡아 봅니다. 냄새가 느껴질 때, 입안이나 배에서 무슨 일이 일어나는지도 알아차립니다.', 25, 'sense:smell'],
        ['귀 가까이에서 살짝 굴려 봅니다. 아주 작은 소리가 들릴지도 몰라요.', 15, 'sense:hear'],
        ['이제 입술에 가져가, 입안에 넣습니다. 아직 씹지 말고, 혀 위에 올려 둔 느낌만 느껴 봅니다.', 20, 'sense:taste'],
        ['천천히 한 번 씹어 봅니다. 터져 나오는 맛, 변해 가는 맛을 느껴 봅니다.', 20, 'sense:taste'],
        ['아주 천천히 씹어 가며, 삼키고 싶은 마음이 일어나는 순간을 알아차려 봅니다.', 25, 'sense:taste'],
        ['삼키는 것을 느껴 봅니다. 목을 지나 배로 내려가는 느낌까지요.', 15, 'sense:taste'],
        ['입안에 남은 맛과 여운을 느껴 봅니다. 몸이 이 한 입만큼 무거워졌다는 것도요.', 15, 'whole'],
        ['평소에 먹던 것과 무엇이 달랐나요. 하루 중 이렇게 깨어 있는 순간을 하나 더 만들어 보세요.', 5, 'end']
      ]
    },
    walk: {
      name: '걷기 명상', min: 8, hue: 95,
      what: '천천히 걸으며 발바닥에 머무르기. 앉아 있기 힘든 날에 특히 좋아요. 몇 걸음 걸을 공간만 있으면 돼요.',
      prep: '서너 걸음 오갈 수 있는 곳에 서 주세요. 휴대폰은 주머니에 넣어도 돼요.',
      lines: [
        ['발을 어깨너비로 벌리고 서 봅니다. 무릎은 살짝 풀고, 팔은 편하게 둡니다.', 5, 'bell'],
        ['발바닥이 바닥에 닿아 있는 느낌을 느껴 봅니다. 무게가 발 앞쪽과 뒤꿈치에 어떻게 실려 있는지요.', 15, 'walk'],
        ['몸무게를 천천히 오른발로 옮겨 봅니다. 왼발이 가벼워지는 느낌을 느껴 봅니다.', 12, 'walk'],
        ['이제 아주 천천히 걷기 시작합니다. 발을 들고, 앞으로 옮기고, 내려놓는 것을 하나하나 느껴 봅니다.', 30, 'walk'],
        ['들고, 옮기고, 내려놓고. 속으로 말해도 좋아요.', 40, 'walk'],
        ['끝에 다다르면 잠시 멈춰 서서 숨을 느끼고, 천천히 몸을 돌립니다.', 30, 'walk'],
        ['마음이 딴 데로 가면 알아차리고, 다시 발바닥으로 돌아옵니다. 발바닥이 지금 여기의 닻이에요.', 45, 'walk'],
        ['조금 더 천천히 걸어 봅니다. 서두를 곳이 없는 걸음이에요.', 45, 'walk'],
        ['이제 멈춰 서서, 서 있는 몸 전체를 느껴 봅니다.', 20, 'whole'],
        ['오늘 하루 어딘가를 걸을 때, 이 발바닥의 느낌을 한 번 떠올려 보세요.', 5, 'end']
      ]
    }
  },

  WEEKS: [
    { t: '자동조종에서 깨어나기', p: ['eat', 'body'], h: '하루 한 번, 늘 하던 일(양치·설거지·샤워)을 처음 하는 것처럼 해 보기' },
    { t: '머릿속 대신 몸으로', p: ['body', 'breath'], h: '좋았던 일 하나를 적고, 그때 몸에서 무엇이 느껴졌는지 함께 적기' },
    { t: '흩어진 마음 모으기', p: ['walk', 'space'], h: '하루 세 번, 정해 둔 시간에 3분 호흡 공간' },
    { t: '지금 여기에 머물기', p: ['sounds', 'space'], h: '불편한 일이 있을 때 3분 호흡 공간을 먼저 하기' },
    { t: '있는 그대로 허용하기', p: ['breath', 'space'], h: '힘든 감정이 오면 "이미 여기 있구나" 하고 한 번 머물러 보기' },
    { t: '생각은 사실이 아니다', p: ['sounds', 'space'], h: '자꾸 드는 생각 하나를 적고, "이건 생각일 뿐" 하고 바라보기' },
    { t: '나를 돌보는 법', p: ['space', 'walk'], h: '기운 나게 하는 일과 기운 빠지게 하는 일을 적고, 하나를 바꿔 보기' },
    { t: '계속 이어가기', p: ['body', 'space'], h: '앞으로도 이어갈 연습 하나를 골라 매일의 자리를 정하기' }
  ],

  AMBIENT: [['pine', '솔바람'], ['rain', '빗소리'], ['stream', '시냇물'], ['bowl', '싱잉볼'], ['off', '끄기']],

  // ── 저장 ─────────────────────────────────────────────────────────
  _get(k, d) { try { return window.Storage ? window.Storage._safeGet(k, d) : d; } catch (e) { return d; } },
  _set(k, v) { try { window.Storage && window.Storage._safeSet(k, v); } catch (e) {} },
  log() { return this._get(this.LOG_KEY, []) || []; },
  pref() { return Object.assign({ ambient: 'pine', vol: 0.5, voice: true, vib: true }, this._get(this.PREF_KEY, {}) || {}); },
  setPref(p) { this._set(this.PREF_KEY, Object.assign(this.pref(), p)); },
  doneCount(pid) { return this.log().filter(l => l.p === pid).length; },
  weekOf() {
    // 코스 주차 = 처음 연습한 날부터 7일 단위 (연습을 건너뛰어도 스스로 고를 수 있다)
    const L = this.log().filter(l => l.w);
    if (!L.length) return 0;
    return Math.max(...L.map(l => l.w));
  },

  // 소나무와의 대화에 짧게 — 최근 연습 3개
  promptContext() {
    const L = this.log().slice(-3);
    if (!L.length) return '';
    return '[솔숲 명상 — 사용자가 앱에서 직접 따라 한 MBCT 연습]\n' + L.map(l => {
      const d = new Date(l.at);
      return `- ${d.getMonth() + 1}/${d.getDate()} ${this.PRACTICES[l.p] ? this.PRACTICES[l.p].name : l.p}${l.w ? ` (${l.w}주차)` : ''}${l.feel ? ` · 끝나고: ${l.feel}` : ''}${l.note ? ` · "${String(l.note).slice(0, 60)}"` : ''}`;
    }).join('\n') + '\n연습 이야기가 나오면 판단하지 말고 경험을 궁금해해 주세요. 새 연습을 권할 땐 [그림:명상|연습이름] 카드(3분 호흡 공간·바디스캔·호흡 명상·소리와 생각·한 입 명상·걷기 명상)를 쓰세요.';
  },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  // ── 코스 화면 ─────────────────────────────────────────────────────
  open() {
    this._css();
    this.close();
    const ov = document.createElement('div');
    ov.id = 'forest-ov';
    ov.dataset.ovGuard = '1';
    const L = this.log();
    const wk = this.weekOf();
    const total = L.length, minutes = Math.round(L.reduce((s, l) => s + (l.sec || 0), 0) / 60);
    ov.innerHTML = `
      <div class="fr-home">
        <div class="fr-top">
          <button class="fr-x" data-fr="close" aria-label="닫기">✕</button>
          <span class="fr-kick">소나무와 함께 · MBCT</span>
        </div>
        <h2 class="fr-h">솔숲 명상</h2>
        <p class="fr-lead">생각을 고치는 대신, 생각과 감정을 한 걸음 떨어져 바라보는 연습이에요. 음성 안내를 따라 몸으로 해 봐요. 이어폰을 끼면 더 좋아요.</p>
        <div class="fr-stats"><span><b>${total}</b>번 연습</span><span><b>${minutes}</b>분</span><span><b>${wk || '-'}</b>주차</span></div>

        <div class="fr-sec">바로 해 보기</div>
        <div class="fr-quick">
          ${['space', 'breath', 'body', 'sounds', 'eat', 'walk'].map(id => {
            const p = this.PRACTICES[id];
            return `<button class="fr-card" data-fr-play="${id}" style="--h:${p.hue}">
              <span class="fr-card__m">${p.min}분</span><b>${p.name}</b><span>${this._esc(p.what)}</span>
              ${this.doneCount(id) ? `<i>${this.doneCount(id)}번 함</i>` : ''}</button>`;
          }).join('')}
        </div>

        <div class="fr-sec">8주 코스 <small>MBCT는 8주 동안 한 주에 한 주제씩 익혀요. 한 주 동안 두 연습을 번갈아 매일 해 보세요.</small></div>
        <ol class="fr-weeks">
          ${this.WEEKS.map((w, i) => {
            const n = i + 1, did = L.filter(l => l.w === n).length;
            return `<li class="${n <= wk ? 'on' : ''}">
              <div class="fr-wk"><span>${n}주</span><b>${w.t}</b>${did ? `<i>${did}회</i>` : ''}</div>
              <div class="fr-wk__p">${w.p.map(pid => `<button data-fr-play="${pid}" data-fr-week="${n}">▶ ${this.PRACTICES[pid].name}</button>`).join('')}</div>
              <div class="fr-wk__h">생활 속 연습 · ${w.h}</div>
            </li>`;
          }).join('')}
        </ol>
        <p class="fr-foot">힘든 기억이 너무 크게 올라오면 언제든 멈춰도 괜찮아요. 위기일 땐 1577-0199 · 109.</p>
      </div>`;
    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
  },

  close() {
    this._stop();
    const ov = document.getElementById('forest-ov');
    if (ov) ov.remove();
  },

  // ── 연습 플레이어 ─────────────────────────────────────────────────
  play(pid, week) {
    const p = this.PRACTICES[pid];
    if (!p) return;
    this._css();
    this._stop();
    const ov = document.getElementById('forest-ov') || (() => { const d = document.createElement('div'); d.id = 'forest-ov'; d.dataset.ovGuard = '1'; document.body.appendChild(d); return d; })();
    const pref = this.pref();
    this._run = { pid, week: week || 0, i: -1, paused: false, t0: Date.now(), timer: null, audio: null, clouds: 0 };
    ov.innerHTML = `
      <div class="fr-play" style="--h:${p.hue}">
        <div class="fr-sky" id="fr-sky"></div>
        <div class="fr-trees" aria-hidden="true"></div>
        <div class="fr-bar">
          <button class="fr-x" data-fr="stop" aria-label="그만하기">✕</button>
          <div class="fr-prog"><i id="fr-prog"></i></div>
          <span id="fr-left" class="fr-left"></span>
        </div>
        <div class="fr-stage" id="fr-stage"></div>
        <p class="fr-say" id="fr-say" aria-live="polite">${p.prep ? this._esc(p.prep) : this._esc(p.name)}</p>
        <form class="fr-cloudin" id="fr-cloudin" hidden><input id="fr-cloudtxt" maxlength="40" placeholder="떠오른 생각을 적어 구름으로 보내기" autocomplete="off"><button>보내기</button></form>
        <div class="fr-ctl">
          <button data-fr="back" aria-label="이전 안내">⏮</button>
          <button data-fr="toggle" class="fr-main" id="fr-toggle" aria-label="시작">▶</button>
          <button data-fr="next" aria-label="다음 안내">⏭</button>
        </div>
        <div class="fr-mix">
          <div class="fr-amb">${this.AMBIENT.map(([k, l]) => `<button data-fr-amb="${k}" class="${pref.ambient === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <label>배경음 <input type="range" id="fr-vol" min="0" max="1" step="0.05" value="${pref.vol}"></label>
          <label><input type="checkbox" id="fr-voice" ${pref.voice ? 'checked' : ''}> 음성 안내</label>
          <label><input type="checkbox" id="fr-vib" ${pref.vib ? 'checked' : ''}> 진동</label>
        </div>
      </div>`;
    this._stage(null);
    this._paintProgress();
    // 시작은 사용자가 ▶ 를 눌러서 — 소리는 손짓이 있어야 켜진다
  },

  _start() {
    const r = this._run; if (!r) return;
    this._audioOn();
    if (r.i < 0) { r.i = 0; r.t0 = Date.now(); this._step(); }
    else { r.paused = false; this._resumeStep(); }
    const b = document.getElementById('fr-toggle'); if (b) { b.textContent = '❚❚'; b.setAttribute('aria-label', '잠시 멈춤'); }
  },
  _pause() {
    const r = this._run; if (!r) return;
    r.paused = true;
    clearTimeout(r.timer);
    if (r.audio) try { r.audio.pause(); } catch (e) {}
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    const b = document.getElementById('fr-toggle'); if (b) { b.textContent = '▶'; b.setAttribute('aria-label', '계속'); }
  },
  _resumeStep() { this._step(); },
  _jump(d) {
    const r = this._run; if (!r) return;
    const n = this.PRACTICES[r.pid].lines.length;
    r.i = Math.max(0, Math.min(n - 1, (r.i < 0 ? 0 : r.i) + d));
    if (r.paused || r.i === 0 && d < 0) { r.paused = false; this._audioOn(); }
    this._step();
    const b = document.getElementById('fr-toggle'); if (b) { b.textContent = '❚❚'; }
  },

  async _step() {
    const r = this._run; if (!r || r.paused) return;
    clearTimeout(r.timer);
    if (r.audio) { try { r.audio.pause(); } catch (e) {} r.audio = null; }
    const p = this.PRACTICES[r.pid];
    const line = p.lines[r.i];
    if (!line) return this._finish();
    const [text, wait, cue] = line;
    const say = document.getElementById('fr-say');
    if (say) { say.classList.remove('in'); void say.offsetWidth; say.textContent = text; say.classList.add('in'); }
    this._stage(cue || this._lastCue || null);
    if (cue) this._lastCue = cue === 'bell' || cue === 'end' ? this._lastCue : cue;
    if (cue === 'bell' || cue === 'end' || r.i === 0) { this._bell(); this._vib([60]); }
    this._paintProgress();
    const myI = r.i;
    await this._speak(text, p, r.i);
    if (!this._run || this._run !== r || r.paused || r.i !== myI) return;
    r.timer = setTimeout(() => { if (this._run === r && !r.paused && r.i === myI) { r.i++; this._step(); } }, (wait || 3) * 1000);
  },

  // 음성: 녹음 파일 → 폰 음성 합성 → 글자만(읽는 시간만큼 기다림)
  _speak(text, p, i) {
    const pref = this.pref();
    const readMs = Math.max(2500, text.length * 170);
    if (!pref.voice) return new Promise(res => setTimeout(res, readMs));
    const r = this._run;
    const file = this.AUDIO_BASE + this._hash(text) + '.mp3';
    return new Promise(res => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; res(); } };
      const a = new Audio(file);
      a.volume = 1;
      r.audio = a;
      a.onended = done;
      a.onerror = () => {
        if (r.audio !== a) return done();
        r.audio = null;
        // 녹음이 없으면 폰의 한국어 음성
        try {
          const S = window.speechSynthesis;
          if (!S) return setTimeout(done, readMs);
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'ko-KR'; u.rate = 0.82; u.pitch = 0.95;
          const v = S.getVoices().find(x => /ko/i.test(x.lang));
          if (v) u.voice = v;
          u.onend = done; u.onerror = () => setTimeout(done, readMs);
          S.speak(u);
          setTimeout(done, readMs * 3);   // 음성 엔진이 멈춰도 넘어가게
        } catch (e) { setTimeout(done, readMs); }
      };
      a.play().catch(() => a.onerror());
    });
  },

  // 문장 → 파일 이름 (tools/forest-tts.mjs 와 같은 규칙: FNV-1a 32bit, 16진수)
  _hash(s) {
    let h = 0x811c9dc5;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  },

  _paintProgress() {
    const r = this._run; if (!r) return;
    const p = this.PRACTICES[r.pid];
    const n = p.lines.length, i = Math.max(0, r.i);
    const bar = document.getElementById('fr-prog'); if (bar) bar.style.width = (r.i < 0 ? 0 : (i / n) * 100) + '%';
    // 남은 시간 어림: 남은 줄의 (읽는 시간 + 고요한 시간)
    const left = p.lines.slice(i).reduce((s, l) => s + l[0].length * 0.17 + (l[1] || 3), 0);
    const el = document.getElementById('fr-left'); if (el) el.textContent = r.i < 0 ? `${p.min}분` : `${Math.max(1, Math.round(left / 60))}분 남음`;
    // 하늘 색: 숲의 새벽 → 해 뜨는 쪽으로 천천히
    const sky = document.getElementById('fr-sky');
    if (sky) sky.style.setProperty('--t', String(r.i < 0 ? 0 : i / Math.max(1, n - 1)));
  },

  // ── 화면 신호 ────────────────────────────────────────────────────
  _stage(cue) {
    const st = document.getElementById('fr-stage'); if (!st) return;
    const cin = document.getElementById('fr-cloudin'); if (cin) cin.hidden = cue !== 'cloud';
    const kind = !cue ? 'orb' : cue.split(':')[0];
    const arg = (cue || '').split(':')[1] || '';
    if (st.dataset.kind === kind && kind !== 'body' && kind !== 'sense') return;
    st.dataset.kind = kind;
    if (kind === 'breath') {
      st.innerHTML = `<div class="fr-orb breathe"><span></span></div><div class="fr-orb__t" id="fr-bt">들이쉬고</div>`;
      this._breathLabel();
    } else if (kind === 'body' || kind === 'whole') {
      st.innerHTML = this._bodySvg(kind === 'whole' ? 'all' : arg);
    } else if (kind === 'sense') {
      const S = [['see', '보기'], ['touch', '만지기'], ['smell', '냄새'], ['hear', '소리'], ['taste', '맛']];
      st.innerHTML = `<div class="fr-senses">${S.map(([k, l]) => `<span class="${k === arg ? 'on' : ''}"><i>${{ see: '◉', touch: '✋', smell: '❀', hear: '♪', taste: '◒' }[k]}</i>${l}</span>`).join('')}</div>`;
    } else if (kind === 'ripple') {
      st.innerHTML = `<div class="fr-ripple"><i></i><i></i><i></i><i></i></div>`;
    } else if (kind === 'cloud') {
      st.innerHTML = `<div class="fr-clouds" id="fr-clouds"></div>`;
      ['내가 뭘 잘못했지', '내일 일', '배고프다'].forEach((t, k) => setTimeout(() => this._cloud(t, true), 800 + k * 2600));
    } else if (kind === 'walk') {
      st.innerHTML = `<div class="fr-walk"><i></i><i></i><i></i><i></i></div>`;
    } else {
      st.innerHTML = `<div class="fr-orb"><span></span></div>`;
    }
  },
  _breathLabel() {
    // 구슬이 5초 들숨 · 5초 날숨으로 움직인다 (CSS 와 같은 주기). 들숨 시작에 아주 짧은 진동
    clearInterval(this._bt);
    let inhale = true;
    const tick = () => {
      const el = document.getElementById('fr-bt');
      if (!el) { clearInterval(this._bt); return; }
      if (this._run && this._run.paused) return;
      el.textContent = inhale ? '들이쉬고' : '내쉬고';
      if (inhale) this._vib([18]);
      inhale = !inhale;
    };
    tick();
    this._bt = setInterval(tick, 5000);
  },
  _cloud(text, ghost) {
    const box = document.getElementById('fr-clouds'); if (!box) return;
    const c = document.createElement('span');
    c.className = 'fr-cloud' + (ghost ? ' ghost' : '');
    c.textContent = text;
    c.style.left = (8 + Math.random() * 55) + '%';
    c.style.animationDuration = (16 + Math.random() * 8) + 's';
    box.appendChild(c);
    setTimeout(() => c.remove(), 26000);
  },
  _bodySvg(part) {
    const on = k => (part === 'all' || part === k) ? 'on' : '';
    // 단순한 사람 모양 — 부위별로 켜진다
    return `<svg class="fr-body" viewBox="0 0 120 260" role="img" aria-label="몸 지도">
      <circle class="${on('head')} ${on('face')}" cx="60" cy="26" r="18"/>
      <rect class="${on('neck')}" x="53" y="44" width="14" height="12" rx="5"/>
      <path class="${on('shoulders')}" d="M28 62 Q60 50 92 62 L92 72 L28 72 Z"/>
      <rect class="${on('chest')}" x="34" y="72" width="52" height="34" rx="10"/>
      <rect class="${on('back')}" x="36" y="104" width="48" height="10" rx="4"/>
      <rect class="${on('belly')}" x="36" y="112" width="48" height="24" rx="10"/>
      <rect class="${on('pelvis')}" x="36" y="134" width="48" height="22" rx="10"/>
      <rect class="${on('arms')}" x="16" y="66" width="14" height="72" rx="7"/><rect class="${on('arms')}" x="90" y="66" width="14" height="72" rx="7"/>
      <circle class="${on('hands')}" cx="23" cy="146" r="8"/><circle class="${on('hands')}" cx="97" cy="146" r="8"/>
      <rect class="${on('lleg')}" x="38" y="154" width="18" height="80" rx="9"/><rect class="${on('rleg')}" x="64" y="154" width="18" height="80" rx="9"/>
      <ellipse class="${on('lfoot')}" cx="45" cy="242" rx="13" ry="7"/><ellipse class="${on('rfoot')}" cx="75" cy="242" rx="13" ry="7"/>
    </svg>`;
  },

  // ── 소리: 배경음·종 (WebAudio 로 직접 만든다 — 음원 파일 없이) ─────────
  _audioOn() {
    try {
      if (!this._ac) this._ac = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ac.state === 'suspended') this._ac.resume();
      this._ambient(this.pref().ambient);
    } catch (e) {}
  },
  _noise(ac, color) {
    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; return src;
  },
  _ambient(kind) {
    const ac = this._ac; if (!ac) return;
    if (this._amb) { try { this._amb.stop(); } catch (e) {} this._amb = null; }
    if (!kind || kind === 'off') return;
    const out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
    const vol = this.pref().vol;
    out.gain.linearRampToValueAtTime(vol * 0.9, ac.currentTime + 3);
    const nodes = [];
    const lfo = (target, rate, depth, base) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); target.value = base; o.start(); nodes.push(o); };
    if (kind === 'pine' || kind === 'rain' || kind === 'stream') {
      const n = this._noise(ac, kind === 'pine' ? 'brown' : 'pink');
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      if (kind === 'pine') { f.type = 'lowpass'; lfo(f.frequency, 0.07, 350, 600); lfo(g.gain, 0.05, 0.35, 0.6); }
      if (kind === 'rain') { f.type = 'highpass'; f.frequency.value = 900; g.gain.value = 0.55; }
      if (kind === 'stream') { f.type = 'bandpass'; f.Q.value = 0.7; lfo(f.frequency, 0.23, 500, 1400); g.gain.value = 0.7; }
      n.connect(f); f.connect(g); g.connect(out); n.start(); nodes.push(n);
    }
    if (kind === 'bowl' || kind === 'pine') {
      // 싱잉볼처럼 낮게 울리는 화음 (솔바람에는 아주 작게 깔아 음악처럼)
      const base = 110, level = kind === 'bowl' ? 0.07 : 0.018;
      [1, 1.5, 2.01, 3.02].forEach((m, k) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = base * m;
        g.gain.value = level / (k + 1);
        lfo(g.gain, 0.08 + k * 0.03, level / (k + 1.5), level / (k + 1));
        o.connect(g); g.connect(out); o.start(); nodes.push(o);
      });
    }
    this._ambOut = out;
    this._amb = { stop: () => { try { out.gain.cancelScheduledValues(ac.currentTime); out.gain.setTargetAtTime(0, ac.currentTime, 0.4); } catch (e) {} setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); try { out.disconnect(); } catch (e) {} }, 1800); } };
  },
  _bell() {
    const ac = this._ac; if (!ac) return;
    const t = ac.currentTime, out = ac.createGain();
    out.gain.value = 0.22; out.connect(ac.destination);
    [[523.25, 1], [1437, 0.45], [2820, 0.18], [528, 0.8]].forEach(([f, a], k) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + (k ? 3.5 : 7));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 7.2);
    });
  },
  _vib(pattern) { try { if (this.pref().vib && navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} },

  _stop() {
    const r = this._run;
    if (r) { clearTimeout(r.timer); if (r.audio) try { r.audio.pause(); } catch (e) {} }
    clearInterval(this._bt);
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    if (this._amb) { this._amb.stop(); this._amb = null; }
    this._run = null; this._lastCue = null;
  },

  // ── 끝: 소감 한 줄 ───────────────────────────────────────────────
  _finish() {
    const r = this._run; if (!r) return;
    const sec = Math.round((Date.now() - r.t0) / 1000);
    const p = this.PRACTICES[r.pid];
    this._bell(); this._vib([60, 120, 60]);
    const done = { p: r.pid, w: r.week || 0, at: Date.now(), sec };
    this._pending = done;
    const stage = document.querySelector('.fr-play');
    if (!stage) return;
    clearInterval(this._bt);
    const say = document.getElementById('fr-say'); if (say) say.textContent = '';
    document.getElementById('fr-stage').innerHTML = `
      <div class="fr-done">
        <b>${p.name}, 끝까지 함께했어요</b>
        <span>지금 몸과 마음은 어떤가요?</span>
        <div class="fr-feel">${['차분해요', '가벼워요', '그대로예요', '졸려요', '불편했어요'].map(f => `<button data-fr-feel="${f}">${f}</button>`).join('')}</div>
        <textarea id="fr-note" maxlength="200" placeholder="알아차린 것 한 줄 (선택)"></textarea>
        <button class="fr-save" data-fr="save">기록하고 마치기</button>
      </div>`;
    const ctl = document.querySelector('.fr-ctl'); if (ctl) ctl.hidden = true;
    const bar = document.getElementById('fr-prog'); if (bar) bar.style.width = '100%';
  },
  _save() {
    const d = this._pending; if (!d) return this.open();
    const sel = document.querySelector('[data-fr-feel].on');
    if (sel) d.feel = sel.dataset.frFeel;
    const note = (document.getElementById('fr-note') || {}).value;
    if (note && note.trim()) d.note = note.trim().slice(0, 200);
    const L = this.log(); L.push(d); this._set(this.LOG_KEY, L.slice(-300));
    this._pending = null;
    if (window.Storage && window.Storage.markActiveDay) try { window.Storage.markActiveDay(); } catch (e) {}
    if (window.App && window.App.showRecordToast) window.App.showRecordToast('솔숲 명상을 기록했어요');
    this.open();
  },

  // ── 모양 ─────────────────────────────────────────────────────────
  _css() {
    if (document.getElementById('forest-css')) return;
    const s = document.createElement('style');
    s.id = 'forest-css';
    s.textContent = `
#forest-ov{position:fixed;inset:0;z-index:1300;background:#0f1f19;color:#eef4ea;font-family:inherit;overflow:hidden;}
#forest-ov button{font:inherit;cursor:pointer;}
#forest-ov [hidden]{display:none !important;}
.fr-home{height:100%;overflow-y:auto;padding:calc(.8rem + env(safe-area-inset-top)) 1.15rem calc(2rem + env(safe-area-inset-bottom));background:radial-gradient(120% 60% at 50% 0%,#2d5a46 0%,#0f1f19 70%);}
.fr-top{display:flex;align-items:center;gap:.6rem;}
.fr-x{all:unset;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);color:#fff;font-weight:800;}
.fr-kick{font-size:.74rem;letter-spacing:.12em;color:#a9cbb6;font-weight:700;}
.fr-h{font-family:'Gowun Batang',serif;font-size:2rem;margin:1rem 0 .3rem;color:#fff;}
.fr-lead{color:#c5dacc;font-size:.9rem;line-height:1.65;margin:0 0 1rem;}
.fr-stats{display:flex;gap:.5rem;margin-bottom:1.3rem;}
.fr-stats span{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:.55rem;text-align:center;font-size:.75rem;color:#a9cbb6;}
.fr-stats b{display:block;font-size:1.25rem;color:#fff;}
.fr-sec{font-weight:800;font-size:.95rem;margin:1.3rem 0 .6rem;color:#fff;}
.fr-sec small{display:block;font-weight:500;font-size:.76rem;color:#a9cbb6;margin-top:.2rem;line-height:1.5;}
.fr-quick{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;}
.fr-card{all:unset;box-sizing:border-box;cursor:pointer;position:relative;border-radius:18px;padding:.85rem .85rem .9rem;min-height:132px;display:flex;flex-direction:column;gap:.25rem;
  background:linear-gradient(160deg,hsl(var(--h) 38% 32%),hsl(calc(var(--h) + 20) 42% 16%));border:1px solid rgba(255,255,255,.1);}
.fr-card b{font-size:.98rem;color:#fff;}
.fr-card span{font-size:.72rem;color:rgba(255,255,255,.72);line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.fr-card .fr-card__m{font-size:.68rem;font-weight:800;color:#fff;background:rgba(0,0,0,.25);border-radius:99px;padding:.1rem .5rem;align-self:flex-start;display:inline-block;}
.fr-card i{position:absolute;right:.7rem;top:.75rem;font-style:normal;font-size:.66rem;color:#d7ecdf;}
.fr-weeks{list-style:none;margin:0;padding:0;display:grid;gap:.5rem;}
.fr-weeks li{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:.75rem .85rem;}
.fr-weeks li.on{border-color:#7cc39c;}
.fr-wk{display:flex;align-items:baseline;gap:.5rem;}
.fr-wk span{font-size:.72rem;font-weight:800;color:#7cc39c;}
.fr-wk b{font-size:.92rem;color:#fff;}
.fr-wk i{margin-left:auto;font-style:normal;font-size:.7rem;color:#a9cbb6;}
.fr-wk__p{display:flex;flex-wrap:wrap;gap:.35rem;margin:.5rem 0 .35rem;}
.fr-wk__p button{all:unset;cursor:pointer;font-size:.78rem;font-weight:700;background:rgba(124,195,156,.16);color:#d7ecdf;border-radius:99px;padding:.3rem .7rem;}
.fr-wk__h{font-size:.74rem;color:#a9cbb6;line-height:1.5;}
.fr-foot{font-size:.72rem;color:#8fb09c;margin-top:1.4rem;text-align:center;}
.fr-play{position:absolute;inset:0;display:flex;flex-direction:column;padding:calc(.7rem + env(safe-area-inset-top)) 1.1rem calc(1rem + env(safe-area-inset-bottom));}
.fr-sky{position:absolute;inset:0;--t:0;z-index:-2;transition:background 6s ease;
  background:linear-gradient(180deg,
    hsl(calc(var(--h) + (40 - var(--h)) * var(--t)) calc(30% + 20% * var(--t)) calc(12% + 20% * var(--t))) 0%,
    hsl(calc(var(--h) + 10) 35% 14%) 60%, #0b1712 100%);}
.fr-trees{position:absolute;left:0;right:0;bottom:0;height:34%;z-index:-1;opacity:.55;
  background:
    linear-gradient(115deg,transparent 48%,#08130e 49%) 0 100%/60px 90px repeat-x,
    linear-gradient(-115deg,transparent 48%,#08130e 49%) 30px 100%/60px 90px repeat-x,
    linear-gradient(115deg,transparent 48%,#0d1c15 49%) 15px 100%/44px 140px repeat-x,
    linear-gradient(-115deg,transparent 48%,#0d1c15 49%) 37px 100%/44px 140px repeat-x;}
.fr-bar{display:flex;align-items:center;gap:.7rem;}
.fr-prog{flex:1;height:5px;border-radius:99px;background:rgba(255,255,255,.15);overflow:hidden;}
.fr-prog i{display:block;height:100%;width:0;background:#cfe8d8;transition:width 1s ease;}
.fr-left{font-size:.78rem;color:#cfe0d4;min-width:4.2em;text-align:right;}
.fr-stage{flex:1;display:grid;place-items:center;min-height:0;}
.fr-say{min-height:5.4em;text-align:center;font-size:1.08rem;line-height:1.7;color:#f2f7ef;margin:.4rem auto 1rem;max-width:30em;text-wrap:balance;}
.fr-say.in{animation:frIn 1.2s ease;}
@keyframes frIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
.fr-ctl{display:flex;justify-content:center;align-items:center;gap:1.4rem;}
.fr-ctl button{all:unset;cursor:pointer;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.1);font-size:1rem;}
.fr-ctl .fr-main{width:72px;height:72px;background:#eaf5ee;color:#16372a;font-size:1.4rem;font-weight:800;}
.fr-mix{margin-top:1rem;display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem .9rem;font-size:.76rem;color:#c5dacc;align-items:center;}
.fr-amb{display:flex;gap:.3rem;flex-wrap:wrap;justify-content:center;width:100%;}
.fr-amb button{all:unset;cursor:pointer;padding:.28rem .65rem;border-radius:99px;border:1px solid rgba(255,255,255,.2);font-size:.75rem;}
.fr-amb button.on{background:#eaf5ee;color:#16372a;font-weight:800;}
.fr-mix label{display:inline-flex;align-items:center;gap:.35rem;}
.fr-mix input[type=range]{width:90px;accent-color:#cfe8d8;}
.fr-orb{width:min(58vw,240px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;
  background:radial-gradient(circle at 40% 35%,rgba(255,255,255,.55),rgba(160,220,190,.25) 45%,rgba(60,120,95,.08) 70%);box-shadow:0 0 80px rgba(150,220,185,.35);animation:frIdle 8s ease-in-out infinite;}
.fr-orb span{width:34%;aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.55);filter:blur(6px);}
.fr-orb.breathe{animation:frBreath 10s ease-in-out infinite;}
.fr-orb__t{position:absolute;margin-top:calc(min(58vw,240px) + 1.4rem);font-size:.9rem;letter-spacing:.2em;color:#d7ecdf;}
@keyframes frIdle{50%{transform:scale(1.04);}}
@keyframes frBreath{0%,100%{transform:scale(.72);filter:brightness(.85);}50%{transform:scale(1.08);filter:brightness(1.15);}}
.fr-body{height:min(46vh,340px);}
.fr-body *{fill:rgba(255,255,255,.12);stroke:rgba(255,255,255,.25);stroke-width:1;transition:fill 1.5s ease,filter 1.5s ease;}
.fr-body .on{fill:#bfe8cf;filter:drop-shadow(0 0 10px rgba(190,240,210,.9));}
.fr-senses{display:grid;grid-template-columns:repeat(5,1fr);gap:.4rem;width:100%;max-width:360px;}
.fr-senses span{display:grid;place-items:center;gap:.3rem;padding:.8rem 0;border-radius:16px;background:rgba(255,255,255,.06);font-size:.74rem;color:#a9cbb6;transition:all 1s ease;}
.fr-senses i{font-style:normal;font-size:1.5rem;}
.fr-senses span.on{background:rgba(245,200,130,.25);color:#fff3df;transform:scale(1.12);box-shadow:0 0 30px rgba(245,200,130,.35);}
.fr-ripple{position:relative;width:min(70vw,280px);aspect-ratio:1;}
.fr-ripple i{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(200,230,255,.55);animation:frRip 6s ease-out infinite;opacity:0;}
.fr-ripple i:nth-child(2){animation-delay:1.5s}.fr-ripple i:nth-child(3){animation-delay:3s}.fr-ripple i:nth-child(4){animation-delay:4.5s}
@keyframes frRip{0%{transform:scale(.1);opacity:.9;}100%{transform:scale(1);opacity:0;}}
.fr-clouds{position:relative;width:100%;height:100%;min-height:220px;overflow:hidden;}
.fr-cloud{position:absolute;bottom:-40px;padding:.55rem 1rem;border-radius:999px;background:rgba(255,255,255,.88);color:#35514a;font-size:.86rem;font-weight:700;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:frDrift linear forwards;}
.fr-cloud.ghost{background:rgba(255,255,255,.45);color:#fff;}
@keyframes frDrift{0%{transform:translate(0,0);opacity:0;}10%{opacity:1;}100%{transform:translate(40px,-340px);opacity:0;}}
.fr-cloudin{display:flex;gap:.4rem;margin:-.4rem 0 .8rem;}
.fr-cloudin input{flex:1;font:inherit;font-size:.88rem;padding:.6rem .85rem;border-radius:99px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.25);color:#fff;}
.fr-cloudin button{all:unset;cursor:pointer;padding:.55rem .9rem;border-radius:99px;background:#eaf5ee;color:#16372a;font-weight:800;font-size:.84rem;}
.fr-walk{display:grid;grid-template-columns:1fr 1fr;gap:1.6rem 2.4rem;}
.fr-walk i{width:34px;height:58px;border-radius:50% 50% 45% 45%;background:rgba(255,255,255,.18);animation:frStep 4s ease-in-out infinite;}
.fr-walk i:nth-child(2){animation-delay:1s}.fr-walk i:nth-child(3){animation-delay:2s}.fr-walk i:nth-child(4){animation-delay:3s}
@keyframes frStep{0%,60%,100%{background:rgba(255,255,255,.14);}20%{background:#cfe8d8;box-shadow:0 0 22px rgba(207,232,216,.8);}}
.fr-done{display:grid;gap:.6rem;text-align:center;width:100%;max-width:360px;}
.fr-done b{font-family:'Gowun Batang',serif;font-size:1.35rem;}
.fr-done span{color:#c5dacc;font-size:.88rem;}
.fr-feel{display:flex;flex-wrap:wrap;justify-content:center;gap:.35rem;}
.fr-feel button{all:unset;cursor:pointer;padding:.4rem .8rem;border-radius:99px;border:1px solid rgba(255,255,255,.25);font-size:.82rem;}
.fr-feel button.on{background:#eaf5ee;color:#16372a;font-weight:800;}
.fr-done textarea{font:inherit;font-size:.88rem;min-height:70px;border-radius:14px;padding:.6rem .8rem;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.25);color:#fff;resize:none;}
.fr-save{all:unset;cursor:pointer;padding:.85rem;border-radius:14px;background:#eaf5ee;color:#16372a;font-weight:800;text-align:center;}
@media (prefers-reduced-motion: reduce){.fr-orb,.fr-orb.breathe,.fr-ripple i,.fr-walk i,.fr-cloud,.fr-say.in{animation-duration:0s!important;animation-iteration-count:1!important;}}
`;
    document.head.appendChild(s);
  }
};

document.addEventListener('click', function (e) {
  const F = window.Forest;
  if (!F || !e.target.closest) return;
  const pl = e.target.closest('[data-fr-play]');
  if (pl) { F.play(pl.dataset.frPlay, +pl.dataset.frWeek || 0); return; }
  const amb = e.target.closest('[data-fr-amb]');
  if (amb) {
    F.setPref({ ambient: amb.dataset.frAmb });
    document.querySelectorAll('[data-fr-amb]').forEach(b => b.classList.toggle('on', b === amb));
    if (F._run && !F._run.paused && F._run.i >= 0) F._ambient(amb.dataset.frAmb);
    return;
  }
  const feel = e.target.closest('[data-fr-feel]');
  if (feel) { document.querySelectorAll('[data-fr-feel]').forEach(b => b.classList.toggle('on', b === feel)); return; }
  const a = e.target.closest('[data-fr]');
  if (!a) return;
  const act = a.dataset.fr;
  if (act === 'close') F.close();
  else if (act === 'stop') { F._stop(); F.open(); }
  else if (act === 'toggle') { if (!F._run) return; (F._run.i < 0 || F._run.paused) ? F._start() : F._pause(); }
  else if (act === 'next') F._jump(1);
  else if (act === 'back') F._jump(-1);
  else if (act === 'save') F._save();
});
document.addEventListener('input', function (e) {
  const F = window.Forest; if (!F) return;
  if (e.target.id === 'fr-vol') {
    const v = +e.target.value; F.setPref({ vol: v });
    if (F._ambOut && F._ac) try { F._ambOut.gain.setTargetAtTime(v * 0.9, F._ac.currentTime, 0.2); } catch (x) {}
  }
});
document.addEventListener('change', function (e) {
  const F = window.Forest; if (!F) return;
  if (e.target.id === 'fr-voice') F.setPref({ voice: e.target.checked });
  if (e.target.id === 'fr-vib') F.setPref({ vib: e.target.checked });
});
document.addEventListener('submit', function (e) {
  if (e.target.id !== 'fr-cloudin') return;
  e.preventDefault();
  const i = document.getElementById('fr-cloudtxt');
  if (i && i.value.trim() && window.Forest) { window.Forest._cloud(i.value.trim()); i.value = ''; }
});
