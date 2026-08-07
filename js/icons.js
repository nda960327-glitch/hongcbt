/* ============================================================
   Icons & Illustrations — 손으로 그린 커스텀 SVG 시스템 (이모지 대체)
   window.Icons.svg(name, {size, cls, color}) -> SVG 문자열
   window.Icons.art(name) -> 컬러 일러스트 SVG 문자열
   따뜻한 힐링 팔레트: 세이지/테라코타/허니/크림
   ============================================================ */
(function () {
  const P = {
    sage: '#4f8a6b', sageL: '#6fae86', sageX: '#8fc9a6',
    clay: '#c57c54', clayL: '#e0a46e',
    honey: '#e8b04b', rose: '#d98a84', blue: '#7ba0b8', blueL: '#9bc3d1',
    cream: '#faf5ee', ink: '#3a342e', muted: '#a99c8c', white: '#ffffff',
  };

  /* ---- 라인 아이콘 (24x24, currentColor stroke, 색 상속) ---- */
  const LINE = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5h4v5"/>',
    chat: '<path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3.5V16H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 10h8M8 13h5"/>',
    counselor: '<circle cx="12" cy="7" r="3.2"/><path d="M5.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"/><path d="M16.5 12.5v2a2.5 2.5 0 0 0 5 0V13" fill="none"/><circle cx="21.5" cy="12.5" r="1"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
    fullscreen: '<path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
    reset: '<path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 20v-4h4"/>',
    gem: '<path d="M6 4h12l3 5-9 11L3 9l3-5Z"/><path d="M3 9h18M9 4 7 9l5 11M15 4l2 5-5 11"/>',
    record: '<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4M8 12h8M8 16h5"/>',
    dashboard: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5" rx="1"/><rect x="12" y="8" width="3" height="9" rx="1"/><rect x="17" y="14" width="3" height="3" rx="1"/>',
    book: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H7.5A2.5 2.5 0 0 0 5 22.5Z"/><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3Z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>',
    phone: '<path d="M6 3h3l1.5 5-2 1.2a12 12 0 0 0 5.3 5.3l1.2-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/>',
    sos: '<circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/>',
    pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    quote: '<path d="M9 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v3l3-3V9a2 2 0 0 0-1-2Z"/><path d="M20 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v3l3-3V9a2 2 0 0 0-1-2Z"/>',
    download: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M5 20h14"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 3.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.6 12 20 12 20Z"/>',
    check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    stethoscope: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M6 3H4M14 3h2M10 15v1a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/>',
    hospital: '<rect x="4" y="7" width="16" height="14" rx="1.5"/><path d="M9 7V4h6v3M12 11v5M9.5 13.5h5M4 21h16"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>',
    'volume-2': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    'volume-off': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    /* 인지왜곡 10 */
    d_all: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none"/>',
    d_over: '<path d="M4 8a8 8 0 0 1 14-3M20 5v4h-4"/><path d="M20 16a8 8 0 0 1-14 3M4 19v-4h4"/>',
    d_filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>',
    d_disq: '<path d="M12 4v13M7 12l5 5 5-5"/><path d="M6 20h12"/>',
    d_jump: '<circle cx="12" cy="11" r="6"/><path d="M9.5 11a2.5 2.5 0 0 1 5 0"/><path d="M8 20l1.5-3M16 20l-1.5-3"/>',
    d_mag: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>',
    d_emo: '<path d="M7 15a4 4 0 0 1-1-7.9A5 5 0 0 1 16 6.2 3.5 3.5 0 0 1 17 13"/><path d="M9 20c1-1.5 1-3 0-4.5M13 21c1.2-2 1.2-4 0-6"/>',
    d_should: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5"/>',
    d_person: '<circle cx="12" cy="8" r="3.4"/><path d="M6 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6"/>',
    d_label: '<path d="M4 12V6a2 2 0 0 1 2-2h6l8 8-8 8-8-8Z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
  };

  /* ---- 기분 얼굴 5종 (currentColor) ---- */
  function face(mouth) {
    return '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/>' + mouth;
  }
  const FACES = {
    faceSad: face('<path d="M8.5 16.5c1-1.4 2.2-2.1 3.5-2.1s2.5.7 3.5 2.1"/>'),
    faceDown: face('<path d="M9 16c.9-.8 1.9-1.2 3-1.2s2.1.4 3 1.2"/>'),
    faceNeutral: face('<path d="M9 15.5h6"/>'),
    faceSmile: face('<path d="M8.5 14c1 1.4 2.2 2.1 3.5 2.1s2.5-.7 3.5-2.1"/>'),
    // ── 마음 도구 대시보드(게임) 전용 ──────────────────────────────
    closet: '<path d="M12 4.5a2 2 0 1 0 1.6 3.2L20 12.6c.9.6.5 2-.6 2H4.6c-1.1 0-1.5-1.4-.6-2l6.4-4.9"/><path d="M4.5 14.6 4 19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-.5-4.4"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M12 13.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2L9.1 15.3l2-.3Z"/><path d="M8.5 10.5 6 3h4l2 4 2-4h4l-2.5 7.5"/>',
    shop: '<path d="M4 8h16l-1 11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L4 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M9 11.5v1M15 11.5v1"/>',
    water: '<path d="M12 3.5c3.2 3.6 5.5 6.4 5.5 9.2A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.5-5.3C6.5 9.9 8.8 7.1 12 3.5Z"/><path d="M9.4 12.8a2.7 2.7 0 0 0 2.1 2.5"/>',
    coin: '<ellipse cx="12" cy="8.5" rx="7" ry="3.2"/><path d="M5 8.5v6c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2v-6"/><path d="M5 11.6c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2"/>',
    cash: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
    quest: '<path d="M6 4h11l-1.6 3L17 10H6Z"/><path d="M6 3.2V21"/><path d="M4.4 21h3.2"/>',
    sprout: '<path d="M12 20v-7"/><path d="M12 13C9.6 13 7 11.4 7 8c3.4 0 5 2.2 5 5Z"/><path d="M12 12.4c0-3.2 1.8-5.4 5.2-5.4 0 3.4-2.6 5.4-5.2 5.4Z"/><path d="M8 20h8"/>',
    breath: '<path d="M3 9h10.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 13h13a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 17h6"/>',
    letter: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/>',
    checkin: '<path d="M12 20s-6.5-4.2-6.5-8.8A3.6 3.6 0 0 1 12 8.6a3.6 3.6 0 0 1 6.5 2.6C18.5 15.8 12 20 12 20Z"/><path d="M9.4 12.2 11 13.8l3.4-3.4"/>',
    note: '<path d="M6 3.5h9L19 8v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14.5 3.7V8H19"/><path d="M8.5 12h7M8.5 15.5h5"/>',
    faceGrin: face('<path d="M8 13.8c.7 2 2.2 3 4 3s3.3-1 4-3Z"/>'),
  };

  const STAR_FULL = '<path d="M12 3.2l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.7 6.7 19.6l1.2-6L3.4 9.5l6-.7L12 3.2Z" fill="currentColor" stroke="none"/>';
  const STAR_EMPTY = '<path d="M12 3.2l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.7 6.7 19.6l1.2-6L3.4 9.5l6-.7L12 3.2Z" fill="none" stroke="currentColor" stroke-width="1.4"/>';

  function svg(name, opts) {
    opts = opts || {};
    const size = opts.size || 24;
    const cls = opts.cls ? ' class="' + opts.cls + '"' : '';
    const style = opts.color ? ' style="color:' + opts.color + '"' : '';
    let body = LINE[name] || FACES[name];
    let extra = '';
    if (name === 'starFull') body = STAR_FULL;
    else if (name === 'starEmpty') body = STAR_EMPTY;
    if (!body) return '';
    const filled = (name === 'starFull');
    const strokeAttrs = filled ? '' :
      ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '"' +
      cls + style + strokeAttrs + ' aria-hidden="true">' + body + '</svg>';
  }

  function stars(rating, size) {
    size = size || 16;
    let out = '<span class="star-row" style="display:inline-flex;gap:1px;color:' + P.honey + ';vertical-align:middle;">';
    for (let i = 1; i <= 5; i++) {
      out += svg(i <= Math.round(rating) ? 'starFull' : 'starEmpty', { size });
    }
    return out + '</span>';
  }

  /* ============================================================
     컬러 일러스트 (자립형, 배경 포함)
     ============================================================ */
  const ART = {};

  // 브랜드 마스코트: 우렁의사 — 청진기를 두른 다정한 달팽이
  ART.mascot = function (s) {
    s = s || 96;
    return '<svg viewBox="0 0 120 120" width="' + s + '" height="' + s + '" aria-label="우렁의사" role="img">' +
      '<defs>' +
      '<linearGradient id="mShell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + P.clayL + '"/><stop offset="1" stop-color="' + P.clay + '"/></linearGradient>' +
      '<linearGradient id="mBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.sageX + '"/><stop offset="1" stop-color="' + P.sageL + '"/></linearGradient>' +
      '</defs>' +
      '<ellipse cx="60" cy="104" rx="34" ry="7" fill="' + P.ink + '" opacity="0.08"/>' +
      // body
      '<path d="M26 96c-6 0-10-5-9-11 1-9 8-16 18-17 6-1 10 2 12 7l6 15c1 4-2 6-6 6H26Z" fill="url(#mBody)"/>' +
      // head
      '<path d="M84 92c11 0 20-9 20-20 0-8-5-13-11-13-5 0-9 3-11 8-2 6-5 12-11 15 4 6 8 10 13 10Z" fill="url(#mBody)"/>' +
      '<circle cx="86" cy="66" r="15" fill="url(#mBody)"/>' +
      // antennae
      '<path d="M80 54c-2-6-1-11 2-14" stroke="' + P.sage + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="81" cy="39" r="3.2" fill="' + P.clay + '"/>' +
      '<path d="M92 54c1-6 4-10 8-12" stroke="' + P.sage + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="101" cy="41" r="3.2" fill="' + P.clay + '"/>' +
      // shell (spiral)
      '<circle cx="48" cy="62" r="30" fill="url(#mShell)"/>' +
      '<path d="M48 62m-20 0a20 20 0 1 0 40 0 20 20 0 1 0-40 0" fill="none" stroke="' + P.cream + '" stroke-width="4" opacity="0.55"/>' +
      '<path d="M48 62a12 12 0 1 1 8 11" fill="none" stroke="' + P.cream + '" stroke-width="4" stroke-linecap="round" opacity="0.7"/>' +
      // face
      '<circle cx="90" cy="66" r="2.4" fill="' + P.ink + '"/>' +
      '<circle cx="82" cy="66" r="2.4" fill="' + P.ink + '"/>' +
      '<path d="M82 73c2 2.2 6 2.2 8 0" stroke="' + P.ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<circle cx="94" cy="71" r="2.6" fill="' + P.rose + '" opacity="0.55"/>' +
      // stethoscope
      '<path d="M40 78c-3 10 3 18 13 19 9 1 15-5 15-13" stroke="' + P.sage + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="68" cy="83" r="4.5" fill="' + P.white + '" stroke="' + P.sage + '" stroke-width="3"/>' +
      '</svg>';
  };

  // 홈 히어로: 대화하는 두 말풍선 + 마음
  ART.heroChat = function () {
    return '<svg viewBox="0 0 160 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<path d="M20 24h70a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H44l-16 12V66h-8a10 10 0 0 1-10-10V34a10 10 0 0 1 10-10Z" fill="' + P.white + '" opacity="0.92"/>' +
      '<path d="M40 40h44M40 50h30" stroke="' + P.sageL + '" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M150 58h-40a10 10 0 0 0-10 10v14a10 10 0 0 0 10 10h30l14 10V92a10 10 0 0 0 6-10V68a10 10 0 0 0-10-10Z" fill="' + P.honey + '" opacity="0.9"/>' +
      '<path d="M114 72h30M114 82h20" stroke="' + P.white + '" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M78 96c-8-5-14-10-14-16a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 6-6 11-14 16Z" fill="' + P.rose + '"/>' +
      '</svg>';
  };

  // 제휴 카드 — 병원
  ART.adHospital = function () {
    return '<svg viewBox="0 0 260 120" width="100%" height="120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="260" height="120" fill="' + P.sage + '"/>' +
      '<circle cx="212" cy="26" r="40" fill="' + P.sageL + '" opacity="0.5"/>' +
      '<rect x="96" y="34" width="70" height="74" rx="6" fill="' + P.cream + '"/>' +
      '<rect x="110" y="48" width="12" height="12" rx="2" fill="' + P.sageL + '"/><rect x="140" y="48" width="12" height="12" rx="2" fill="' + P.sageL + '"/>' +
      '<rect x="110" y="70" width="12" height="12" rx="2" fill="' + P.sageL + '"/><rect x="140" y="70" width="12" height="12" rx="2" fill="' + P.sageL + '"/>' +
      '<rect x="122" y="90" width="18" height="18" fill="' + P.clay + '"/>' +
      '<path d="M128 40v10M123 45h10" stroke="' + P.clay + '" stroke-width="3.5" stroke-linecap="round"/>' +
      '<rect x="70" y="60" width="26" height="48" rx="4" fill="' + P.cream + '" opacity="0.85"/>' +
      '<rect x="166" y="66" width="24" height="42" rx="4" fill="' + P.cream + '" opacity="0.8"/>' +
      '</svg>';
  };
  // 제휴 카드 — 수면
  ART.adSleep = function () {
    return '<svg viewBox="0 0 260 120" width="100%" height="120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="260" height="120" fill="' + P.blue + '"/>' +
      '<circle cx="60" cy="30" r="1.6" fill="' + P.white + '"/><circle cx="96" cy="20" r="1.2" fill="' + P.white + '"/><circle cx="150" cy="26" r="1.5" fill="' + P.white + '"/><circle cx="200" cy="44" r="1.3" fill="' + P.white + '"/><circle cx="40" cy="70" r="1.2" fill="' + P.white + '"/>' +
      '<path d="M176 34a34 34 0 1 0 22 46 27 27 0 0 1-22-46Z" fill="' + P.cream + '"/>' +
      '<path d="M70 96c6-10 18-10 24 0M92 96c5-8 15-8 20 0" stroke="' + P.blueL + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M96 58l10-10h-10M112 46l7-7h-7" stroke="' + P.cream + '" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>' +
      '</svg>';
  };
  // 제휴 카드 — 도서
  ART.adBook = function () {
    return '<svg viewBox="0 0 260 120" width="100%" height="120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="260" height="120" fill="' + P.clayL + '"/>' +
      '<circle cx="54" cy="90" r="46" fill="' + P.clay + '" opacity="0.35"/>' +
      '<path d="M96 44c14-8 30-8 34 2v52c-4-8-20-8-34-2Z" fill="' + P.cream + '"/>' +
      '<path d="M164 44c-14-8-30-8-34 2v52c4-8 20-8 34-2Z" fill="' + P.white + '"/>' +
      '<path d="M138 52c8-3 14-3 18-1M138 64c8-3 14-3 18-1M138 76c8-3 14-3 18-1" stroke="' + P.clayL + '" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M112 40l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1 3-6Z" fill="' + P.honey + '"/>' +
      '</svg>';
  };

  // 상담사 아바타 (변형 색상) — 헤어/피부/의사가운
  ART.avatar = function (variant, s) {
    s = s || 88;
    const sets = [
      { hair: '#5a4632', skin: '#f2c9a0', coat: P.white, accent: P.sage },
      { hair: '#2f2a26', skin: '#eabf94', coat: P.white, accent: P.clay },
      { hair: '#6b4a2f', skin: '#f4d2ad', coat: P.white, accent: P.blue },
      { hair: '#3a2c22', skin: '#e8b184', coat: P.white, accent: P.honey },
    ];
    const c = sets[(variant || 0) % sets.length];
    return '<svg viewBox="0 0 100 100" width="' + s + '" height="' + s + '" aria-label="상담사" role="img">' +
      '<rect width="100" height="100" rx="16" fill="' + P.cream + '"/>' +
      '<circle cx="50" cy="86" r="34" fill="' + c.coat + '"/>' +
      '<path d="M40 66h20v14a10 10 0 0 1-20 0Z" fill="' + c.skin + '"/>' +
      '<circle cx="50" cy="46" r="22" fill="' + c.skin + '"/>' +
      '<path d="M28 46c0-15 10-24 22-24s22 9 22 24c0-6-4-9-8-9-3-6-9-8-14-8-9 0-16 6-16 16 0 2-6 2-6 5Z" fill="' + c.hair + '"/>' +
      '<path d="M28 44c2-4 5-6 8-6M72 44c-2-4-5-6-8-6" fill="none"/>' +
      '<circle cx="43" cy="47" r="2.2" fill="' + P.ink + '"/><circle cx="57" cy="47" r="2.2" fill="' + P.ink + '"/>' +
      '<path d="M45 55c2 2 6 2 8 0" stroke="' + P.ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="40" cy="52" r="2.6" fill="' + P.rose + '" opacity="0.5"/><circle cx="60" cy="52" r="2.6" fill="' + P.rose + '" opacity="0.5"/>' +
      '<path d="M44 70c-6 12 3 20 6 20s12-8 6-20" fill="none" stroke="' + c.accent + '" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="56" cy="86" r="3.4" fill="' + c.coat + '" stroke="' + c.accent + '" stroke-width="2.6"/>' +
      '</svg>';
  };

  // 빈 상태 일러스트 — 새싹
  ART.sprout = function () {
    return '<svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">' +
      '<path d="M40 100h40l-4-26H44l-4 26Z" fill="' + P.clayL + '"/>' +
      '<path d="M38 74h44" stroke="' + P.clay + '" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M60 74V46" stroke="' + P.sage + '" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M60 54c-2-12-12-18-22-16-2 12 8 20 22 16Z" fill="' + P.sageL + '"/>' +
      '<path d="M60 48c2-14 12-20 24-18 2 12-8 22-24 18Z" fill="' + P.sageX + '"/>' +
      '</svg>';
  };

  window.Icons = { svg, stars, art: ART, palette: P, line: LINE, faces: FACES };
})();
