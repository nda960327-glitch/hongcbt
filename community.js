// 상담소 소식 — 제휴 상담소가 블로그처럼 글을 올리고, 이용자는 좋아요·댓글만 단다.
//
//  · 글은 상담소(소장 앱, hsession/hcode 인증)와 그 상담소에 <소속이 확인된> 상담사(상담사 앱)가 쓴다. 이용자는 글을 쓸 수 없다.
//    상담사가 쓴 글은 posts.author_id/author_name 에 글쓴이가 남고, 상담사는 자기 글만 고치고 지운다. 소장은 상담소 글 전부를 관리한다.
//  · 이용자 반응은 좋아요(기기당 1개)와 댓글. clientKey 로 본인 확인. 댓글은 본인이 지울 수 있고,
//    상담소는 자기 글의 댓글을 숨길 수 있다. 운영자는 글·댓글 모두 숨길 수 있다.
//  · 상담소 페이지(프로필: 소개·전화·주소·홈페이지·운영시간)는 hospitals 표의 profile 칸(JSON)에 둔다.
//  · 댓글은 짧고(500자) 연락처를 지운다 — 플랫폼 밖 직거래 유도를 막는 규칙은 채팅과 같다.
//
//  본문 표기(앱·소장 앱이 같은 규칙으로 그린다): **굵게** · '# ' 큰 글씨 · '## ' 제목 · {red|글}(색: red orange green blue purple gray) · [img:0] 사진
//  경로 (앱은 /api/… 로 부르고 Worker 가 /api 를 뗀다)
//    공개   GET  /community?clientId=&cursor=&hospital=      글 목록(발행된 것만) + 내 좋아요
//                 &sort=hot(인기순, offset 으로 넘김) &tag= &q=(제목·본문 검색) &author= &authors=a,b &hospitals=x,y(구독) &ids=p1,p2(저장한 글)
//           GET  /community/tags                             요즘 많이 쓰인 태그
//           GET  /community/author?id=&clientId=             상담사 블로그(프로필 + 글 + 합계)
//           POST /community/comment/like {cid, clientId, clientKey}   댓글 공감 토글 — 공감 많은 댓글이 '베스트 댓글'
//           GET  /community/best                        요즘 공감 많이 받은 댓글(글 제목과 함께)
//    게시판(posts.board): 없음=상담사 칼럼(상담소·상담사가 쓴 글) · free=수다방 · neru=우렁이 자랑방 · qna=고민 Q&A · meds=약 이야기 · idea=기능 제안·오류 신고 · notice=공지
//      이용자 글은 상담소 자리에 시스템 상담소 'community' 를 넣어 같은 표를 쓴다 — 좋아요·댓글·답글·검색·공개 페이지가 그대로 붙는다.
//           GET  /community?board=column|free|qna|idea|notice
//           POST /community/write {clientId, clientKey, board, title, body, tags, images, thumb, name}   이용자 글쓰기(하루 5개)
//           POST /community/write/delete {id, clientId, clientKey}     내 글 지우기
//           POST /community/report {target: post|comment, id, reason, clientId, clientKey}   신고 — 3명이 신고하면 자동으로 가린다
//    상담사 POST /pro/board/reply {session|code, id, text, parentId}   이용자 글(Q&A 등)에 상담사 이름으로 답하기
//    운영자 POST /admin/community/notice {code, title, body, pinned, id?}   공지 쓰기·고치기
//    회원제(2026-10): 이용자 글과 댓글은 로그인한 사람만 쓴다 — 요청에 session(카카오·네이버·구글 로그인 세션, 앱 계정과 같은 것)을 싣는다.
//      글·댓글의 주인은 계정('acc:<user id>')으로 적는다 → 앱에서 쓴 글을 홈페이지에서도 내 글로 알아본다. 공감·신고는 로그인 없이도 된다(기기 식별).
//           GET  /community?mine=1&session=      내가 쓴 글
//           GET  /community/mycomments?session=  내가 쓴 댓글(글 제목과 함께)
//           GET  /community/profile?session= · POST /community/profile {session, nick, photo}   커뮤니티 프로필(별명·사진 160px JPEG)
//           POST /community/inquiry {session, hospitalId, text}   상담소에 쪽지(회원 → 상담소만. 회원끼리는 없다) · GET /community/inquiries?session=  내가 보낸 쪽지와 답장
//    상담소 GET  /hospital/inquiries?hsession=   POST /hospital/inquiries/reply {hsession, id, text}
//           GET  /community/library   공개된 회원 자료 · POST /community/library/upload {session, title, desc, who, file(PDF data URL ≤300KB)}  인증된 전문가만, 운영자 승인 뒤 공개
//           GET  /community/notifs?session=                    새 소식(내 글의 댓글·내 댓글의 답글·쪽지 답장, 30일)
//           POST /community/pet {session, photo, level}       내 우렁이 방 사진(640px JPEG) — /blog/upet/<id>.jpg 로 나간다
//    비공개 라운지(roles.js): doctor·resident(의사끼리) · expert(상담사끼리) 는 인증된 사람만 읽고 쓴다. 목록·검색·공개 페이지·사이트맵에 나가지 않는다.
//           GET  /community/role?session=                     내 인증 상태
//           POST /community/role/request {session, role, name, org, licenseNo, photo}   인증 신청(면허·자격증 사진, 심사 뒤 지운다)
//    운영자 GET  /admin/community/roles?code=   신청 목록(사진 포함)   POST /admin/community/role/decide {code, userId, ok, reason}
//    이용자가 쓰는 글·댓글은 올리기 전에 screen() 이 거른다 (비공개 라운지는 거르지 않는다 — 전문가끼리의 솔직한 이야기) — 욕설·비하 / 자살·자해 언급 / 밖에서 따로 만나자는 말.
//      이곳이 '같이 죽을 사람을 찾는 곳'이 되는 것을 무엇보다 먼저 막는다: 자살·자해를 말하는 글은 공개하지 않고, 그 자리에서 109 와 앱의 상담을 안내한다.
//      이용자끼리 1:1 로 연락하는 기능(쪽지)은 같은 이유로 만들지 않는다. 연락처·오픈채팅 주소도 올릴 수 없다.
//    댓글은 한 단계 답글(parentId)까지. 답글의 답글은 같은 댓글 아래에 붙는다.
//    같은 글이 검색엔진용 HTML 로도 나간다 — blogpage.js (/blog/…)
//           GET  /community/post?id=&clientId=               글 하나 + 댓글
//           GET  /community/hospital?id=                     상담소 페이지(프로필 + 글 목록)
//    이용자 POST /community/like    {id, clientId, clientKey}            토글
//           POST /community/comment {id, text, name, clientId, clientKey}
//           POST /community/comment/delete {cid, clientId, clientKey}   본인 댓글
//    상담소 GET  /hospital/posts?hsession=            내 글 전체(초안 포함) + 댓글 수
//           POST /hospital/posts/save {hsession, post: {id?, title, body, tags, published, pinned}}
//           POST /hospital/posts/delete {hsession, id}
//           GET  /hospital/comments?hsession=&id=     내 글의 댓글(숨긴 것 포함)
//           POST /hospital/comments/hide {hsession, cid, hidden}
//           POST /hospital/profile {hsession, profile: {intro, tel, addr, url, hours}}
//    상담사 GET  /pro/posts?session=|code=           내가 쓴 글(초안 포함) + 소속 상담소
//           POST /pro/posts/save {session|code, post: {id?, title, body, tags, published, images, thumb}}
//           POST /pro/posts/delete {session|code, id}
//    운영자 GET  /admin/community?code=   전체 글   POST /admin/community/hide {code, id, hidden}
//           POST /admin/community/comment/hide {code, cid, hidden}
import { json, isAdmin, verifyClient, s, nowMs } from './market.js';
import { resolveHospital } from './hospital.js';
import { pingIndexNow } from './blogpage.js';
import { resolveUser } from './oauth.js';
import { PRIVATE, PRIVATE_SQL, ROLE_NAME, isPrivate, canSee, rolesOf } from './roles.js';
import { sendHtml, mailWrap, sendApplicationToOps, OPS_REPLY, resolveCounselor } from './auth.js';

const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 7);
const PAGE = 20;
const TITLE_MAX = 80, BODY_MAX = 6000, COMMENT_MAX = 500, NAME_MAX = 20, TAGS_MAX = 5;
const COMMENT_PER_10MIN = 6;         // 기기당 댓글 도배 방지
const BOARDS = ['free', 'neru', 'qna', 'meds', 'student', 'doctor', 'resident', 'expert', 'idea'];            // 이용자가 쓸 수 있는 게시판
const SYS_HOSP = 'community';                       // 이용자 글·공지가 속하는 시스템 상담소 (hospitals 표의 한 줄 — 마이그레이션이 넣는다)
const USER_PER_DAY = 5, USER_TITLE_MAX = 60, USER_BODY_MAX = 3000, REPORT_HIDE = 3;
const AUTHOR_PER_DAY = 5;            // 상담사 한 사람이 하루에 새로 올릴 수 있는 글 수
const POST_PER_DAY = 20;             // 상담소당 하루 글 수(실수로 스크립트가 돌아도 표가 터지지 않게)

// 전화번호·이메일·카톡 아이디 같은 연락처를 가린다 (chat 과 같은 규칙, 댓글은 공개 글이라 더 엄격)
const maskContact = t => String(t || '')
  .replace(/(\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, '[연락처]')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[이메일]')
  .replace(/(카톡|카카오톡|카카오|kakao|katalk|라인|line|텔레그램|telegram|인스타|insta)\s*(아이디|id|ID)?\s*[:：]?\s*[\w.-]{3,}/gi, '[아이디]');

// ── 이용자 글·댓글 사전 차단 ──────────────────────────────────────────
//  원문 그대로 본다. 글자 사이 공백을 지우고 보면 '혼자 해결'(자해)·'다시 발견'(시발) 같은 멀쩡한 말이 걸린다 — 한 칸 띄어 쓴 것까지만 잡는다.
const RE_CRISIS = /자살|자해(?!결)|죽고\s?싶|죽어\s?버리(고|ㄹ|려|겠|면)|죽을래|죽으려|죽는\s?게\s?(낫|편)|죽을\s?(방법|사람|곳|날|거|까)|같이\s?죽|함께\s?죽|동반\s?(자살|으로)|목숨을?\s?끊|목을?\s?(매|맬)|뛰어\s?내리(고|려|ㄹ|면|겠)|투신|번개탄|연탄\s?(불|가스)|청산가리|수면제를?\s?(모으|모아|한꺼번|다\s?먹|\d+\s?알)|손목을?\s?(긋|그어|그을|그었)|유서를?\s?(쓰|썼|남기|남겼)|극단적인?\s?선택|삶을\s?끝|생을\s?마감|사라지고\s?싶|없어지고\s?싶|살기\s?싫|살고\s?싶지\s?않/;
const RE_ABUSE = /(^|[^가-힣])(시발|씨발|씨바)|ㅅㅂ|ㅆㅂ|씹(새|년|놈|창)|병신|ㅂㅅ|븅신|좆|존나|개새끼|개새|개색|개같은|개년|개놈|(이|저|그|야|미친)\s?새끼|지랄|ㅈㄹ|닥쳐|꺼져|미친\s?(년|놈)|썅|쌍(년|놈)|엠창|니애미|느금|한남충|김치녀|맘충|틀딱|급식충|정신병자|찐따|fuck|shit|bitch/i;
const RE_OUT = /오픈\s?채팅|오픈\s?카톡|오픈톡|옾챗|오카방|open\.kakao|t\.me\/|디스코드|discord|텔레(그램)?\s?(로|으로|에서|방|주소|아이디)|디엠\s?(주|줘|보내|해)|dm\s?(주|줘|보내|해)|쪽지\s?(주|줘|보내)|따로\s?(만나|연락|얘기|이야기)|개인(적으로)?\s?연락|카톡\s?(해|하자|주세요|줘|아이디)|번호\s?(알려|교환|줄게|주세요)/i;
const MSG_CRISIS = '지금 많이 힘드신 것 같아요. 이 글은 공개 게시판에 올리지 않았어요.\n\n혼자 견디지 마세요. 자살예방상담전화 109, 정신건강 위기상담 1577-0199 가 24시간 받습니다. 앱에서는 상담사와 바로 이야기할 수 있어요.';
function screen(text) {
  const raw = String(text || '');
  if (RE_CRISIS.test(raw)) return { error: 'crisis', message: MSG_CRISIS };
  if (RE_ABUSE.test(raw)) return { error: 'abuse', message: '욕설이나 누군가를 깎아내리는 표현이 들어 있어요. 그 부분을 고쳐서 다시 올려주세요.' };
  if (RE_OUT.test(raw)) return { error: 'contact', message: '연락처를 주고받거나 다른 곳에서 따로 만나자는 내용은 올릴 수 없어요. 이야기는 이곳에서 나눠주세요.' };
  return null;
}
export { screen };
// 별명에 자격·직함을 적어 전문가인 척하지 못하게 한다 — 약·치료 이야기가 오가는 곳이라, '의사'라는 이름의 댓글은 그대로 믿기 쉽다.
//  인증된 전문가는 글·댓글을 쓸 때 '인증 표시 달기'를 고르면 서버가 이름 뒤에 붙여 준다.
const RE_TITLE = /인증|전문의|전공의|의사|닥터|상담사|심리사|치료사|약사|간호사|원장|소장|교수|박사|운영팀|운영자|관리자|편집팀|마인드\s?인사이드/;
const MSG_TITLE = '별명에는 자격이나 직함을 나타내는 말을 쓸 수 없어요. 전문가라면 [전문가 인증]을 받은 뒤 글을 쓸 때 인증 표시를 달 수 있어요.';
const PRO_SHORT = { doctor: '전문의', resident: '전공의', counselor: '상담사', clinic: '상담소' };

const tagsOf = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(t => s(t, 12).trim()).filter(Boolean).slice(0, TAGS_MAX);

function profileOf(h) {
  let p = {};
  try { p = h && h.profile ? JSON.parse(h.profile) : {}; } catch (e) { p = {}; }
  return { intro: p.intro || '', tel: p.tel || '', addr: p.addr || '', url: p.url || '', hours: p.hours || '' };
}
const hospPublic = h => h ? { id: h.id, name: h.name, dept: h.dept || '', doctor: h.doctor || '', profile: profileOf(h) } : null;

// 화면 표기 기호를 뗀 순수 글 — 목록 발췌문과 검색용
const plainOf = b => String(b || '').replace(/\[스티커:[^\]]*\]/g, '')
  .replace(/\[img:\d+\]/g, '').replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '$2')
  .replace(/\*\*/g, '').replace(/^#{1,2}\s+/gm, '').replace(/\s+/g, ' ').trim();
const parseImages = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, IMG_MAX) : []; } catch (e) { return []; } };
// 사진: 앱이 긴 변 640px·JPEG 로 줄여 보낸다. 서버가 다시 막는 이유는 상담사 사진(market.js checkPhoto)과 같다 —
//  fetch 한 줄이면 원본을 그대로 밀어 넣을 수 있고, 그러면 목록 응답이 통째로 무거워진다.
const IMG_MAX = 4, IMG_BYTES = 110 * 1024, THUMB_BYTES = 24 * 1024;
const jpegOk = (v, max) => typeof v === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= max;
function checkImages(list) {
  const arr = Array.isArray(list) ? list.slice(0, IMG_MAX) : [];
  for (const v of arr) if (!jpegOk(v, IMG_BYTES)) return null;
  return arr;
}

const rowPost = (r, mine, cid) => ({
  id: r.id, hospitalId: r.hospital_id, hospital: r.hospital_name || '', dept: r.hospital_dept || '',
  author: r.author_name || '', authorId: r.author_id || '', board: r.board || 'column', own: !!(cid && r.client_id && r.client_id === cid),
  title: r.title, body: r.body || '', excerpt: plainOf(r.body).slice(0, 120), thumb: r.thumb || '', images: r.images === undefined ? undefined : parseImages(r.images),
  tags: String(r.tags || '').split(',').filter(Boolean),
  published: !!r.published, pinned: !!r.pinned, hidden: !!r.hidden,
  likes: r.likes || 0, comments: r.comments || 0, views: r.views || 0, mine: !!mine,
  created: r.created, updated: r.updated || r.created
});
const rowComment = c => ({
  id: c.id, postId: c.post_id, clientId: c.client_id, name: c.name || '익명', text: c.text,
  ts: c.ts, hidden: !!c.hidden, byHospital: !!c.by_hospital, parentId: c.parent_id || '', likes: c.likes || 0, mine: !!c.mine
});

// 댓글 + 공감 수
const CM_SQL = 'SELECT c.*, (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes FROM post_comments c';
const LIST_COLS = 'p.id, p.hospital_id, p.title, p.body, p.tags, p.published, p.pinned, p.hidden, p.created, p.updated, p.thumb, p.author_id, p.author_name, p.views, p.board, p.client_id';
const LIST_SQL = `SELECT ${LIST_COLS}, h.name AS hospital_name, h.dept AS hospital_dept,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.hidden = 0) AS comments
  FROM posts p JOIN hospitals h ON h.id = p.hospital_id`;

export async function handleCommunity(request, env, cors, path, ctx) {
  if (!/^\/(community|hospital\/(posts|comments|profile|inquiries)|pro\/posts|pro\/board|admin\/community|admin\/hospital-apps)/.test(path)) return null;
  const db = env.DB;
  // 답글이 붙을 댓글 — 답글의 답글은 맨 위 댓글 아래로 모은다(한 단계만). 없는 댓글이면 null.
  const rootOf = async (postId, parentId) => {
    if (!parentId) return '';
    const p = await db.prepare('SELECT id, parent_id FROM post_comments WHERE id = ? AND post_id = ? AND hidden = 0').bind(parentId, postId).first();
    return p ? (p.parent_id || p.id) : null;
  };
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);

  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  const cleanId = v => s(v, 64).replace(/[^\w-]/g, '');
  const noTable = e => /no such table/i.test(String(e && e.message || e));
  // 로그인한 사람 — 글·댓글의 주인 표시('acc:<id>')와 기본 별명
  //  별명은 커뮤니티 프로필(user_profiles.nick)이 먼저, 없으면 가입할 때 받은 이름.
  const userOf = async () => {
    const u = await resolveUser(db, s(body.session || q('session'), 128)).catch(() => null);
    if (!u) return null;
    let pf = null; try { pf = await db.prepare('SELECT nick FROM user_profiles WHERE user_id = ?').bind(u.id).first(); } catch (e) {}
    return { id: u.id, key: 'acc:' + u.id, nick: s((pf && pf.nick) || u.nickname, NAME_MAX).trim(), provider: u.provider, email: u.email || '' };
  };
  // 비공개 게시판을 볼 수 있는가 — 볼 수 없으면 응답을, 볼 수 있으면 null 을 돌려준다
  const gate = async (board, u) => {
    if (!isPrivate(board)) return null;
    if (!u) return LOGIN();
    u.roles = u.roles || await rolesOf(db, u.id);
    return canSee(board, u.roles) ? null : json({ error: 'role', message: '인증된 전문가만 볼 수 있는 게시판이에요', need: PRIVATE[board] }, 403, cors);
  };
  const NOT_PRIVATE = `(p.board IS NULL OR p.board NOT IN ${PRIVATE_SQL})`;
  const LOGIN = () => json({ error: 'login', message: '로그인한 뒤에 쓸 수 있어요' }, 401, cors);

  // 내 좋아요 — 목록에 표시할 때만 쓴다. 키가 틀려도 목록은 준다(좋아요 표시만 빠진다).
  const myLikes = async (cid, ids) => {
    if (!cid || !ids.length) return new Set();
    const r = await db.prepare(`SELECT post_id FROM post_likes WHERE client_id = ? AND post_id IN (${ids.map(() => '?').join(',')})`)
      .bind(cid, ...ids).all();
    return new Set((r.results || []).map(x => x.post_id));
  };

  // ══════════════ 공개 ══════════════
  if (path === '/community' && method === 'GET') {
    const cid = cleanId(q('clientId'));
    const cursor = Number(q('cursor')) || 0;
    const hosp = cleanId(q('hospital'));
    const hot = q('sort') === 'hot';
    const offset = Math.max(0, Math.min(2000, Number(q('offset')) || 0));
    const listOf = v => s(v, 1400).split(',').map(cleanId).filter(Boolean).slice(0, 40);
    const authors = listOf(q('authors')), hosps = listOf(q('hospitals')), ids = listOf(q('ids'));
    const author = cleanId(q('author'));
    const tag = s(q('tag'), 12).trim(), kw = s(q('q'), 40).trim();
    const board = s(q('board'), 10);
    const where = ['p.published = 1', 'p.hidden = 0', 'h.active = 1'], args = [];
    if (board === 'column') where.push("(p.board IS NULL OR p.board = '')");
    else if (BOARDS.includes(board) || board === 'notice') { where.push('p.board = ?'); args.push(board); }
    if (isPrivate(board)) { const g = await gate(board, await userOf()); if (g) return g; }
    else if (!q('mine')) where.push(NOT_PRIVATE);   // 비공개 라운지의 글은 그 게시판을 직접 열 때만 (내 글 목록은 예외)
    const meU = q('session') ? await userOf() : null;
    if (q('mine')) { if (!meU) return json({ items: [], next: 0, login: true }, 200, cors); where.push('p.client_id = ?'); args.push(meU.key); }
    const inList = (col, arr) => `${col} IN (${arr.map(() => '?').join(',')})`;
    if (hosp) { where.push('p.hospital_id = ?'); args.push(hosp); }
    if (author) { where.push('p.author_id = ?'); args.push(author); }
    if (ids.length) { where.push(inList('p.id', ids)); args.push(...ids); }
    if (authors.length || hosps.length) {   // 구독 — 구독한 상담사의 글이거나 구독한 상담소의 글
      const or = [];
      if (authors.length) { or.push(inList('p.author_id', authors)); args.push(...authors); }
      if (hosps.length) { or.push(inList('p.hospital_id', hosps)); args.push(...hosps); }
      where.push('(' + or.join(' OR ') + ')');
    }
    if (tag) { where.push("(',' || COALESCE(p.tags, '') || ',') LIKE ?"); args.push('%,' + tag.replace(/[%_]/g, '') + ',%'); }
    if (kw) { const like = '%' + kw.replace(/[%_]/g, '') + '%'; where.push('(p.title LIKE ? OR p.body LIKE ? OR p.tags LIKE ? OR p.author_name LIKE ? OR h.name LIKE ?)'); args.push(like, like, like, like, like); }
    if (cursor && !hot) { where.push('p.created < ?'); args.push(cursor); }
    // 인기순: 좋아요·댓글·조회에 새 글 가산점(일주일 안의 글이 위로). 숫자가 바뀌는 순서라 offset 으로 넘긴다.
    const pinFirst = board === 'notice' || board === 'idea' && false;
    const order = hot ? `(likes * 3 + comments * 4 + COALESCE(p.views, 0) * 0.3 + CASE WHEN p.created > ${nowMs() - 7 * 86400000} THEN 6 ELSE 0 END) DESC, p.created DESC`
      : (hosp ? 'p.pinned DESC, ' : '') + 'p.created DESC';
    let rows = [];
    try {
      rows = (await db.prepare(LIST_SQL + ` WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? ${hot ? 'OFFSET ?' : ''}`)
        .bind(...args, PAGE + 1, ...(hot ? [offset] : [])).all()).results || [];
    } catch (e) { if (noTable(e)) return json({ items: [], next: 0, missing: true }, 200, cors); throw e; }
    const more = rows.length > PAGE;
    if (more) rows.pop();
    const likes = await myLikes(cid, rows.map(r => r.id));
    return json({ items: rows.map(r => rowPost(r, likes.has(r.id), meU ? meU.key : cid)), next: more && !hot ? rows[rows.length - 1].created : 0, nextOffset: more && hot ? offset + PAGE : 0 }, 200, cors);
  }

  if (path === '/community/role' && method === 'GET') {
    const u = await userOf();
    if (!u) return json({ ok: false, login: true }, 200, cors);
    const roles = await rolesOf(db, u.id);
    let req = null; try { req = await db.prepare('SELECT role, status, reason, requested FROM user_roles WHERE user_id = ?').bind(u.id).first(); } catch (e) {}
    return json({ ok: true, roles, names: roles.map(r => ROLE_NAME[r]), request: req ? { role: req.role, status: req.status, reason: req.reason || '', ts: req.requested } : null }, 200, cors);
  }
  if (path === '/community/role/request' && method === 'POST') {
    const u = await userOf();
    if (!u) return LOGIN();
    const role = ['doctor', 'resident', 'counselor'].includes(body.role) ? body.role : '';
    const name = s(body.name, 40).trim(), org = s(body.org, 80).trim(), lic = s(body.licenseNo, 40).trim();
    if (!role || !name) return json({ error: 'missing', message: '역할과 이름을 적어주세요' }, 400, cors);
    if (!jpegOk(body.photo, 350 * 1024)) return json({ error: 'bad-image', message: '면허·자격증 사진을 넣어주세요' }, 400, cors);
    const cur = await db.prepare('SELECT status FROM user_roles WHERE user_id = ?').bind(u.id).first();
    if (cur && cur.status === 'approved') return json({ error: 'dup', message: '이미 인증된 계정이에요' }, 409, cors);
    await db.prepare(`INSERT INTO user_roles (user_id, role, status, name, org, license_no, photo, requested, decided, reason) VALUES (?,?,'pending',?,?,?,?,?,0,'')
      ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, status = 'pending', name = excluded.name, org = excluded.org, license_no = excluded.license_no, photo = excluded.photo, requested = excluded.requested, decided = 0, reason = ''`)
      .bind(u.id, role, name, org, lic, body.photo, nowMs()).run();
    const note = sendApplicationToOps(env, db, `전문가 인증 신청 — ${name} (${ROLE_NAME[role]})`, `${name} 님이 커뮤니티 전문가 인증을 신청했습니다. 운영자 콘솔 › 커뮤니티에서 면허·자격증 사진을 확인하고 승인해 주세요.`,
      [['역할', ROLE_NAME[role]], ['이름', name], ['소속', org], ['면허·자격 번호', lic], ['계정', u.email || u.provider]]).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(note);
    return json({ ok: true }, 200, cors);
  }

  if (path === '/community/profile') {
    const u = await userOf();
    if (!u) return LOGIN();
    if (method === 'POST') {
      const nick = s(body.nick, NAME_MAX).trim();
      if (nick) { const bad = screen(nick); if (bad) return json(bad, 422, cors); if (RE_TITLE.test(nick)) return json({ error: 'abuse', message: MSG_TITLE }, 422, cors); }
      const hasPhoto = Object.prototype.hasOwnProperty.call(body, 'photo');
      if (hasPhoto && body.photo && !jpegOk(body.photo, 40 * 1024)) return json({ error: 'bad-image' }, 400, cors);
      const cur = await db.prepare('SELECT nick, photo FROM user_profiles WHERE user_id = ?').bind(u.id).first();
      await db.prepare('INSERT INTO user_profiles (user_id, nick, photo, updated) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET nick = excluded.nick, photo = excluded.photo, updated = excluded.updated')
        .bind(u.id, nick || (cur && cur.nick) || '', hasPhoto ? (body.photo || '') : ((cur && cur.photo) || ''), nowMs()).run();
    }
    const pf = await db.prepare('SELECT nick, photo FROM user_profiles WHERE user_id = ?').bind(u.id).first();
    return json({ ok: true, profile: { id: u.id, nick: (pf && pf.nick) || u.nick || '', hasPhoto: !!(pf && pf.photo), provider: u.provider, email: u.email } }, 200, cors);
  }

  // 쪽지 — 회원이 상담소에 보낸다. 회원끼리 주고받는 쪽지는 없다(서로 연락해 함께 위험해지는 일을 막으려고).
  //  욕설만 막는다. 힘들다는 말은 상담소에 전해져야 하므로 막지 않고, 대신 그 자리에서 109 를 함께 알려 준다(상담소가 바로 못 볼 수 있다).
  if (path === '/community/inquiry' && method === 'POST') {
    const u = await userOf();
    if (!u) return LOGIN();
    const hid = cleanId(body.hospitalId), text = s(body.text, 600).trim();
    if (!hid || text.length < 5) return json({ error: 'short', message: '내용을 조금 더 적어주세요' }, 400, cors);
    const h = await db.prepare("SELECT id, name FROM hospitals WHERE id = ? AND active = 1 AND id != 'community'").bind(hid).first();
    if (!h) return json({ error: 'not-found' }, 404, cors);
    const bad = screen(text);
    if (bad && bad.error === 'abuse') return json(bad, 422, cors);
    const day = await db.prepare('SELECT COUNT(*) AS n FROM hospital_inquiries WHERE user_id = ? AND ts > ?').bind(u.id, nowMs() - 86400000).first();
    if (day && day.n >= 5) return json({ error: 'limit', message: '쪽지는 하루에 5통까지 보낼 수 있어요' }, 429, cors);
    const it = { id: rid('iq'), hospital_id: h.id, user_id: u.id, name: u.nick || '회원', text, ts: nowMs() };
    await db.prepare('INSERT INTO hospital_inquiries (id, hospital_id, user_id, name, text, ts) VALUES (?,?,?,?,?,?)').bind(it.id, it.hospital_id, it.user_id, it.name, it.text, it.ts).run();
    const crisis = !!(bad && bad.error === 'crisis');
    return json({ ok: true, crisis, message: crisis
      ? '쪽지를 보냈어요. 다만 상담소가 바로 확인하지 못할 수 있어요.\n\n지금 많이 힘들다면 기다리지 말고 자살예방상담전화 109, 정신건강 위기상담 1577-0199 로 전화해 주세요. 24시간 받습니다.'
      : '쪽지를 보냈어요. 답장은 [내 정보]에서 볼 수 있어요.' }, 200, cors);
  }
  if (path === '/community/inquiries' && method === 'GET') {
    const u = await userOf();
    if (!u) return json({ items: [], login: true }, 200, cors);
    let rows = [];
    try { rows = (await db.prepare('SELECT i.id, i.hospital_id, i.text, i.ts, i.reply, i.reply_ts, h.name AS hospital FROM hospital_inquiries i JOIN hospitals h ON h.id = i.hospital_id WHERE i.user_id = ? ORDER BY i.ts DESC LIMIT 50').bind(u.id).all()).results || []; } catch (e) { if (!noTable(e)) throw e; }
    return json({ items: rows.map(r => ({ id: r.id, hospitalId: r.hospital_id, hospital: r.hospital, text: r.text, ts: r.ts, reply: r.reply || '', replyTs: r.reply_ts || 0 })) }, 200, cors);
  }

  // 자료실 — 인증된 전문가(의사·전공의·상담사·상담소)가 작은 PDF 를 올린다. 운영자가 확인한 뒤에 공개된다.
  //  서버 공간이 작아서 파일은 300KB 까지, 한 사람이 하루 3개, 전체 300개까지만 받는다.
  if (path === '/community/library' && method === 'GET') {
    let rows = [];
    try { rows = (await db.prepare("SELECT id, title, descr, who, uploader, size, ts, downloads FROM library_files WHERE status = 'approved' ORDER BY ts DESC LIMIT 200").all()).results || []; } catch (e) { if (!noTable(e)) throw e; }
    return json({ items: rows.map(r => ({ id: r.id, title: r.title, desc: r.descr || '', who: r.who || '', uploader: r.uploader || '', size: r.size || 0, ts: r.ts, downloads: r.downloads || 0 })) }, 200, cors);
  }
  if (path === '/community/library/upload' && method === 'POST') {
    const u = await userOf();
    if (!u) return LOGIN();
    const roles = await rolesOf(db, u.id);
    if (!roles.length) return json({ error: 'role', message: '인증된 전문가만 자료를 올릴 수 있어요' }, 403, cors);
    const title = s(body.title, 60).trim(), descr = s(body.desc, 200).trim();
    const who = ['상담사', '전공의', '의사', '내담자'].includes(body.who) ? body.who : '상담사';
    const file = typeof body.file === 'string' ? body.file : '';
    const m = file.match(/^data:application\/pdf;base64,(JVBERi[A-Za-z0-9+/=]+)$/);
    if (!title || title.length < 3) return json({ error: 'short', message: '자료 이름을 적어주세요' }, 400, cors);
    if (!m) return json({ error: 'bad-file', message: 'PDF 파일만 올릴 수 있어요' }, 400, cors);
    if (m[1].length > 410 * 1024) return json({ error: 'too-big', message: '파일이 너무 커요. 300KB 이하의 PDF 만 올릴 수 있어요' }, 400, cors);
    const bad = screen(title + ' ' + descr);
    if (bad) return json(bad, 422, cors);
    const n = await db.prepare('SELECT (SELECT COUNT(*) FROM library_files WHERE user_id = ? AND ts > ?) AS mine, (SELECT COUNT(*) FROM library_files) AS total').bind(u.id, nowMs() - 86400000).first();
    if (n && n.mine >= 3) return json({ error: 'limit', message: '자료는 하루에 3개까지 올릴 수 있어요' }, 429, cors);
    if (n && n.total >= 300) return json({ error: 'full', message: '자료실이 가득 찼어요. 운영팀에 알려주세요' }, 507, cors);
    const id = rid('lf');
    await db.prepare("INSERT INTO library_files (id, user_id, uploader, title, descr, who, size, data, status, ts, downloads) VALUES (?,?,?,?,?,?,?,?,'pending',?,0)")
      .bind(id, u.id, (u.nick || '회원') + ' · ' + (ROLE_NAME[roles[0]] || '전문가'), title, descr, who, Math.round(m[1].length * 3 / 4), m[1], nowMs()).run();
    return json({ ok: true, id, message: '올렸어요. 운영팀이 확인한 뒤 자료실에 공개돼요(보통 1~2일).' }, 200, cors);
  }

  // 새 소식 — 내 글에 달린 댓글 · 내 댓글에 달린 답글 · 상담소의 쪽지 답장 (최근 30일)
  if (path === '/community/notifs' && method === 'GET') {
    const u = await userOf();
    if (!u) return json({ items: [], login: true }, 200, cors);
    const since = nowMs() - 30 * 86400000;
    const all = async (sql, ...a) => { try { return (await db.prepare(sql).bind(...a).all()).results || []; } catch (e) { if (noTable(e)) return []; throw e; } };
    const a = await all('SELECT c.id, c.post_id, c.name, c.text, c.ts, p.title FROM post_comments c JOIN posts p ON p.id = c.post_id WHERE p.client_id = ? AND c.client_id != ? AND c.hidden = 0 AND p.hidden = 0 AND c.ts > ? ORDER BY c.ts DESC LIMIT 30', u.key, u.key, since);
    const b = await all('SELECT c.id, c.post_id, c.name, c.text, c.ts, p.title FROM post_comments c JOIN post_comments m ON m.id = c.parent_id JOIN posts p ON p.id = c.post_id WHERE m.client_id = ? AND c.client_id != ? AND c.hidden = 0 AND p.hidden = 0 AND c.ts > ? ORDER BY c.ts DESC LIMIT 30', u.key, u.key, since);
    const q3 = await all("SELECT i.id, i.hospital_id, i.reply, i.reply_ts, h.name FROM hospital_inquiries i JOIN hospitals h ON h.id = i.hospital_id WHERE i.user_id = ? AND i.reply IS NOT NULL AND i.reply != '' AND i.reply_ts > ? ORDER BY i.reply_ts DESC LIMIT 10", u.id, since);
    const seen = new Set(), items = [];
    const cut = t => plainOf(t).slice(0, 80);
    b.forEach(x => { seen.add(x.id); items.push({ kind: 'reply', id: x.id, postId: x.post_id, title: x.title, name: x.name || '익명', text: cut(x.text), ts: x.ts }); });
    a.forEach(x => { if (!seen.has(x.id)) items.push({ kind: 'comment', id: x.id, postId: x.post_id, title: x.title, name: x.name || '익명', text: cut(x.text), ts: x.ts }); });
    q3.forEach(x => items.push({ kind: 'inquiry', id: x.id, hospitalId: x.hospital_id, title: x.name, name: x.name, text: cut(x.reply), ts: x.reply_ts }));
    items.sort((x, y) => y.ts - x.ts);
    return json({ items: items.slice(0, 40) }, 200, cors);
  }

  // 내 우렁이 방 사진 — 앱이 방이 바뀔 때 올린다. 커뮤니티 옆칸과 내 정보에 보인다.
  if (path === '/community/pet' && method === 'POST') {
    const u = await userOf();
    if (!u) return LOGIN();
    if (!jpegOk(body.photo, 130 * 1024)) return json({ error: 'bad-image' }, 400, cors);
    const lv = Math.max(1, Math.min(999, parseInt(body.level, 10) || 1));
    await db.prepare('INSERT INTO user_pets (user_id, photo, level, updated) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET photo = excluded.photo, level = excluded.level, updated = excluded.updated')
      .bind(u.id, body.photo, lv, nowMs()).run();
    return json({ ok: true }, 200, cors);
  }

  if (path === '/community/mycomments' && method === 'GET') {
    const u = await userOf();
    if (!u) return json({ items: [], login: true }, 200, cors);
    const rows = (await db.prepare(`SELECT c.id, c.post_id, c.text, c.ts, p.title,
        (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes
      FROM post_comments c JOIN posts p ON p.id = c.post_id WHERE c.client_id = ? AND c.hidden = 0 AND p.hidden = 0 AND p.published = 1 ORDER BY c.ts DESC LIMIT 100`).bind(u.key).all()).results || [];
    return json({ items: rows.map(r => ({ id: r.id, postId: r.post_id, title: r.title, text: r.text, ts: r.ts, likes: r.likes || 0 })) }, 200, cors);
  }

  if (path === '/community/tags' && method === 'GET') {
    let rows = [];
    try { rows = (await db.prepare("SELECT p.tags FROM posts p JOIN hospitals h ON h.id = p.hospital_id WHERE p.published = 1 AND p.hidden = 0 AND h.active = 1 AND p.tags != '' AND (p.board IS NULL OR p.board NOT IN ('doctor','resident','expert')) ORDER BY p.created DESC LIMIT 300").all()).results || []; } catch (e) {}
    const n = {};
    rows.forEach(r => String(r.tags || '').split(',').filter(Boolean).forEach(t => { n[t] = (n[t] || 0) + 1; }));
    return json({ tags: Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 14).map(t => ({ tag: t, n: n[t] })) }, 200, cors);
  }

  // 상담사 블로그 — 글쓴이 한 사람의 소개와 글. 소속이 확인된 운영 중인 상담사만.
  if (path === '/community/author' && method === 'GET') {
    const id = cleanId(q('id')), cid = cleanId(q('clientId'));
    let a = null;
    try { a = await db.prepare('SELECT id, name, hospital, hospital_id, hospital_ok, intro, tags, license, photo FROM counselors WHERE id = ? AND active = 1').bind(id).first(); } catch (e) {}
    if (!a) return json({ error: 'not-found' }, 404, cors);
    const rows = (await db.prepare(LIST_SQL + ' WHERE p.author_id = ? AND p.published = 1 AND p.hidden = 0 AND h.active = 1 ORDER BY p.created DESC LIMIT 60').bind(id).all()).results || [];
    const likes = await myLikes(cid, rows.map(r => r.id));
    let tags = []; try { tags = JSON.parse(a.tags || '[]'); } catch (e) {}
    return json({ ok: true, author: { id: a.id, name: a.name, hospital: a.hospital || '', hospitalId: a.hospital_ok ? (a.hospital_id || '') : '', intro: a.intro || '', tags: Array.isArray(tags) ? tags.slice(0, 8) : [], license: a.license || '', photo: a.photo || '' },
      totals: { posts: rows.length, likes: rows.reduce((x, r) => x + (r.likes || 0), 0), views: rows.reduce((x, r) => x + (r.views || 0), 0) },
      items: rows.map(r => rowPost(r, likes.has(r.id))) }, 200, cors);
  }

  // ── 상담소 직접 등록 신청 (공개) ──
  //  운영자가 콘솔에서 대신 넣던 것을 상담소가 앱에서 직접 낸다. 심사 뒤 승인하면 hospitals 에 들어가고 소장에게 로그인 안내가 간다.
  if (path === '/community/hospital-apply' && method === 'POST') {
    const name = s(body.name, 60).trim(), doctor = s(body.doctor, 40).trim(), email = s(body.email, 160).trim().toLowerCase();
    if (!name || !doctor || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'missing' }, 400, cors);
    // 상담소는 사업자등록번호와 사업자등록증이 필수다(2026-09-26 지시) — 제휴계약·세금계산서·정산에 필요
    const bizno = s(body.bizno, 20).replace(/[^0-9]/g, '');
    if (bizno.length !== 10) return json({ error: 'bizno', message: '사업자등록번호 10자리를 확인해주세요' }, 400, cors);
    if (!jpegOk(body.doc, 200 * 1024)) return json({ error: 'doc', message: '사업자등록증 사진을 첨부해주세요' }, 400, cors);
    const cid = cleanId(body.clientId) || 'anon';
    const dup = await db.prepare("SELECT id FROM hospital_apps WHERE lower(email) = ? AND status = 'pending'").bind(email).first();
    if (dup) return json({ error: 'dup', message: '이미 심사 중인 신청이 있어요' }, 409, cors);
    const doc = body.doc;
    const id = rid('ha');
    await db.prepare(`INSERT INTO hospital_apps (id, client_id, name, doctor, email, tel, addr, bizno, dept, intro, hours, url, doc, status, ts)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`)
      .bind(id, cid, name, doctor, email, s(body.tel, 30).replace(/[^0-9-+ ]/g, ''), s(body.addr, 200).trim(), bizno /* 숫자 10자리 그대로 — 콘솔(hospital.js /hospital/info)이 숫자만으로 비교한다 */,
        s(body.dept, 40).trim(), s(body.intro, 600).trim(), s(body.hours, 200).trim(), s(body.url, 200).trim(), doc, nowMs()).run();
    sendHtml(env, db, email, '[마인드 인사이드] 상담소 제휴 신청이 접수됐습니다', mailWrap('마인드 인사이드', name + ' 제휴 신청이 접수됐습니다', `
      <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">보내주신 상담소 정보를 확인하고 있습니다.<br><b>2~3일 안에</b> 승인 여부를 이 주소로 알려드릴게요.</p>
      <div style="background:#f6f1e7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
        <p style="font-size:13px;font-weight:700;margin:0 0 8px;">승인되면 이렇게 진행돼요</p>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0;">1. 이 주소로 <b>소장 앱(doc.mindinsideapp.com) 로그인 안내</b>와 상담소 코드가 갑니다<br>2. 내담자는 앱에서 상담소 코드로 상담소와 연결됩니다<br>3. 소속 상담사는 등록할 때 이 상담소를 고를 수 있고, 상담료는 상담소로 정산됩니다(상담소 90% · 앱 7% · 결제 수수료 3%)<br>4. 제휴계약서는 승인 메일과 함께 보내드립니다</p>
      </div>
      <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">문의: <a href="mailto:mindinsideapp@gmail.com" style="color:#4f8a6b;">mindinsideapp@gmail.com</a></p>`)).catch(() => {});
    sendApplicationToOps(env, db, `상담소 제휴 신청 — ${name}`, `${name}(소장 ${doctor})이 앱에서 제휴를 신청했습니다. 사업자등록증을 첨부했습니다.`,
      [['상담소', name], ['소장', doctor], ['이메일', email], ['전화', s(body.tel, 30)], ['사업자등록번호', bizno.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3')],
       ['전문 분야', s(body.dept, 40)], ['주소', s(body.addr, 200)], ['운영시간', s(body.hours, 200)], ['홈페이지', s(body.url, 200)], ['소개', s(body.intro, 600)], ['신청 ID', id]],
      { attachments: [{ filename: '사업자등록증.jpg', content: String(doc).replace(/^data:image\/jpeg;base64,/, '') }] }).catch(() => {});
    return json({ ok: true, id }, 200, cors);
  }

  if (path === '/community/hospitals' && method === 'GET') {
    const rows = (await db.prepare("SELECT id, name, dept, profile FROM hospitals WHERE active = 1 AND id != 'community' ORDER BY name").all()).results || [];
    return json({ items: rows.map(h => ({ id: h.id, name: h.name, dept: h.dept || '', addr: profileOf(h).addr })) }, 200, cors);
  }

  if (path === '/community/post' && method === 'GET') {
    const id = cleanId(q('id')), cid = cleanId(q('clientId'));
    if (!id) return json({ error: 'missing' }, 400, cors);
    const r = await db.prepare(LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images') + ' WHERE p.id = ? AND p.published = 1 AND p.hidden = 0').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    if (isPrivate(r.board)) { const g = await gate(r.board, await userOf()); if (g) return g; }
    const likes = await myLikes(cid, [id]);
    const cm = (await db.prepare(CM_SQL + ' WHERE c.post_id = ? AND c.hidden = 0 ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || [];
    if (cid && cm.length) {
      const mineSet = new Set(((await db.prepare('SELECT comment_id FROM post_comment_likes WHERE client_id = ? AND comment_id IN (SELECT id FROM post_comments WHERE post_id = ?)').bind(cid, id).all()).results || []).map(x => x.comment_id));
      cm.forEach(x => { x.mine = mineSet.has(x.id); });
    }
    const hosp = await db.prepare('SELECT * FROM hospitals WHERE id = ?').bind(r.hospital_id).first();
    // 조회수 — 앱에서 글을 열 때마다 1. 응답을 기다리게 하지 않는다.
    const up = db.prepare('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = ?').bind(id).run().catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(up); else await up;
    // 이어 볼 글 — 같은 글쓴이의 글 먼저, 모자라면 같은 상담소의 글
    let more = [];
    try {
      more = (await db.prepare(LIST_SQL + ` WHERE p.published = 1 AND p.hidden = 0 AND h.active = 1 AND ${NOT_PRIVATE} AND p.id != ? AND (p.hospital_id = ? OR p.author_id = ?)
        ORDER BY (CASE WHEN p.author_id = ? THEN 0 ELSE 1 END), p.created DESC LIMIT 4`).bind(id, r.hospital_id, r.author_id || '-', r.author_id || '-').all()).results || [];
    } catch (e) {}
    const meP = q('session') ? await userOf() : null;
    return json({ ok: true, post: rowPost(r, likes.has(id), meP ? meP.key : cid), comments: cm.map(rowComment), hospital: hospPublic(hosp), more: more.map(x => rowPost(x, false)), me: meP ? meP.key : '' }, 200, cors);
  }

  if (path === '/community/hospital' && method === 'GET') {
    const id = cleanId(q('id')), cid = cleanId(q('clientId'));
    const h = await db.prepare('SELECT * FROM hospitals WHERE id = ? AND active = 1').bind(id).first();
    if (!h) return json({ error: 'not-found' }, 404, cors);
    let rows = [];
    try {
      rows = (await db.prepare(LIST_SQL + ' WHERE p.hospital_id = ? AND p.published = 1 AND p.hidden = 0 ORDER BY p.pinned DESC, p.created DESC LIMIT 50').bind(id).all()).results || [];
    } catch (e) { if (!noTable(e)) throw e; }
    const likes = await myLikes(cid, rows.map(r => r.id));
    const stat = await db.prepare('SELECT COUNT(*) n FROM patient_links WHERE hospital_id = ? AND unlinked_at = 0').bind(id).first();
    return json({ ok: true, hospital: hospPublic(h), linked: (stat && stat.n) || 0, items: rows.map(r => rowPost(r, likes.has(r.id))) }, 200, cors);
  }

  // ══════════════ 이용자 반응 ══════════════
  if (path === '/community/like' && method === 'POST') {
    const cid = cleanId(body.clientId), id = cleanId(body.id);
    if (!cid || !id) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    const p = await db.prepare('SELECT id, board FROM posts WHERE id = ? AND published = 1 AND hidden = 0').bind(id).first();
    if (!p) return json({ error: 'not-found' }, 404, cors);
    if (isPrivate(p.board)) { const g = await gate(p.board, await userOf()); if (g) return g; }
    const had = await db.prepare('SELECT 1 x FROM post_likes WHERE post_id = ? AND client_id = ?').bind(id, cid).first();
    if (had) await db.prepare('DELETE FROM post_likes WHERE post_id = ? AND client_id = ?').bind(id, cid).run();
    else await db.prepare('INSERT INTO post_likes (post_id, client_id, ts) VALUES (?,?,?)').bind(id, cid, nowMs()).run();
    const c = await db.prepare('SELECT COUNT(*) n FROM post_likes WHERE post_id = ?').bind(id).first();
    return json({ ok: true, likes: (c && c.n) || 0, mine: !had }, 200, cors);
  }

  if (path === '/community/comment' && method === 'POST') {
    const id = cleanId(body.id);
    const text = maskContact(s(body.text, COMMENT_MAX)).trim();
    if (!id || !text) return json({ error: 'missing' }, 400, cors);
    const u = await userOf();
    if (!u) return LOGIN();
    const cid = u.key;
    let name = s(body.name, NAME_MAX).trim() || u.nick || '익명';
    const p = await db.prepare('SELECT id, board FROM posts WHERE id = ? AND published = 1 AND hidden = 0').bind(id).first();
    if (!p) return json({ error: 'not-found' }, 404, cors);
    if (isPrivate(p.board)) {
      const g = await gate(p.board, u); if (g) return g;
      const lab = ROLE_NAME[(u.roles || []).find(r => PRIVATE[p.board].includes(r))]; if (lab) name = s(name + ' · ' + lab, 40);
    } else {
      const badC = screen(text + ' ' + name);
      if (badC) return json(badC, 422, cors);
      if (RE_TITLE.test(name)) return json({ error: 'abuse', message: MSG_TITLE }, 422, cors);
      if (body.asPro) { const rs = await rolesOf(db, u.id); if (rs.length) name = s(name + ' · 인증 ' + PRO_SHORT[rs[0]], 40); }
    }
    const recent = await db.prepare('SELECT COUNT(*) n FROM post_comments WHERE client_id = ? AND ts > ?').bind(cid, nowMs() - 600000).first();
    if ((recent && recent.n) >= COMMENT_PER_10MIN) return json({ error: 'too-many' }, 429, cors);
    const parent = await rootOf(id, cleanId(body.parentId));
    if (parent === null) return json({ error: 'not-found' }, 404, cors);
    const c = { id: rid('cm'), post_id: id, client_id: cid, name, text, ts: nowMs(), hidden: 0, by_hospital: 0, parent_id: parent };
    await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital, parent_id) VALUES (?,?,?,?,?,?,0,0,?)')
      .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts, parent || null).run();
    return json({ ok: true, comment: rowComment(c) }, 200, cors);
  }

  if (path === '/community/write' && method === 'POST') {
    const board = s(body.board, 10);
    if (!BOARDS.includes(board)) return json({ error: 'missing' }, 400, cors);
    const u = await userOf();
    if (!u) return LOGIN();
    const cid = u.key;
    const title = maskContact(s(body.title, USER_TITLE_MAX)).trim(), text = maskContact(s(body.body, USER_BODY_MAX)).trim();
    if (title.length < 2 || text.length < 5) return json({ error: 'short', message: '제목과 내용을 조금 더 적어주세요' }, 400, cors);
    let roleLabel = '';
    if (isPrivate(board)) {
      const g = await gate(board, u); if (g) return g;
      roleLabel = ROLE_NAME[(u.roles || []).find(r => PRIVATE[board].includes(r))] || '';
    } else {
      const bad = screen(title + ' ' + text + ' ' + s(body.name, NAME_MAX));
      if (bad) return json(bad, 422, cors);
      if (RE_TITLE.test(s(body.name, NAME_MAX))) return json({ error: 'abuse', message: MSG_TITLE }, 422, cors);
      if (body.asPro) { const rs = await rolesOf(db, u.id); if (rs.length) roleLabel = '인증 ' + PRO_SHORT[rs[0]]; }
    }
    const images = checkImages(body.images);
    if (!images) return json({ error: 'bad-image' }, 400, cors);
    const thumb = jpegOk(body.thumb, THUMB_BYTES) ? body.thumb : '';
    const n = await db.prepare('SELECT COUNT(*) n, MAX(created) last FROM posts WHERE client_id = ? AND created > ?').bind(cid, nowMs() - 86400000).first();
    if (n && (n.n >= USER_PER_DAY || (n.last && nowMs() - n.last < 30000))) return json({ error: 'too-many' }, 429, cors);
    const sys = await db.prepare('SELECT id FROM hospitals WHERE id = ? AND active = 1').bind(SYS_HOSP).first();
    if (!sys) return json({ error: 'not-ready' }, 503, cors);
    const id = rid('po');
    await db.prepare('INSERT INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, images, thumb, author_name, board, client_id) VALUES (?,?,?,?,?,1,0,0,?,?,?,?,?,?,?)')
      .bind(id, SYS_HOSP, title, text, tagsOf(body.tags).join(','), nowMs(), nowMs(), images.length ? JSON.stringify(images) : null, thumb, s((s(body.name, NAME_MAX).trim() || u.nick || '익명') + (roleLabel ? ' · ' + roleLabel : ''), 40), board, cid).run();
    if (!isPrivate(board)) pingIndexNow(ctx, id, env);   // 비공개 라운지의 글은 검색엔진에 알리지 않는다
    const r = await db.prepare(LIST_SQL + ' WHERE p.id = ?').bind(id).first();
    return json({ ok: true, post: rowPost(r, false, cid) }, 200, cors);
  }

  if (path === '/community/write/delete' && method === 'POST') {
    const id = cleanId(body.id);
    const u = await userOf();
    if (!u) return LOGIN();
    const cid = u.key;
    const r = await db.prepare('DELETE FROM posts WHERE id = ? AND client_id = ? AND hospital_id = ?').bind(id, cid, SYS_HOSP).run();
    if (r.meta && r.meta.changes) await db.batch([
      db.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM post_comments WHERE post_id = ?').bind(id)
    ]);
    return json({ ok: true, deleted: !!(r.meta && r.meta.changes) }, 200, cors);
  }

  // 신고 — 서로 다른 3명이 신고하면 자동으로 가린다(이용자 글과 댓글만. 상담사 칼럼·공지는 운영자가 본다).
  if (path === '/community/report' && method === 'POST') {
    const cid = cleanId(body.clientId), id = cleanId(body.id);
    const target = body.target === 'comment' ? 'comment' : 'post';
    if (!cid || !id) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    await db.prepare('INSERT OR IGNORE INTO post_reports (target, target_id, client_id, reason, ts) VALUES (?,?,?,?,?)').bind(target, id, cid, s(body.reason, 100), nowMs()).run();
    const n = await db.prepare('SELECT COUNT(*) n FROM post_reports WHERE target = ? AND target_id = ?').bind(target, id).first();
    if (n && n.n >= REPORT_HIDE) {
      if (target === 'comment') await db.prepare('UPDATE post_comments SET hidden = 1 WHERE id = ? AND by_hospital = 0').bind(id).run();
      else await db.prepare("UPDATE posts SET hidden = 1 WHERE id = ? AND board IN ('free','neru','qna','meds','student','doctor','resident','expert','idea')").bind(id).run();
    }
    return json({ ok: true }, 200, cors);
  }

  if (path === '/community/comment/like' && method === 'POST') {
    const cid = cleanId(body.clientId), cmid = cleanId(body.cid);
    if (!cid || !cmid) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    const cm = await db.prepare('SELECT id FROM post_comments WHERE id = ? AND hidden = 0').bind(cmid).first();
    if (!cm) return json({ error: 'not-found' }, 404, cors);
    const had = await db.prepare('SELECT 1 x FROM post_comment_likes WHERE comment_id = ? AND client_id = ?').bind(cmid, cid).first();
    if (had) await db.prepare('DELETE FROM post_comment_likes WHERE comment_id = ? AND client_id = ?').bind(cmid, cid).run();
    else await db.prepare('INSERT INTO post_comment_likes (comment_id, client_id, ts) VALUES (?,?,?)').bind(cmid, cid, nowMs()).run();
    const n = await db.prepare('SELECT COUNT(*) n FROM post_comment_likes WHERE comment_id = ?').bind(cmid).first();
    return json({ ok: true, likes: (n && n.n) || 0, mine: !had }, 200, cors);
  }

  // 베스트 댓글 — 최근 30일에 공감을 많이 받은 댓글. 커뮤니티 첫 화면에 글 제목과 함께 보여준다.
  if (path === '/community/best' && method === 'GET') {
    let rows = [];
    try {
      rows = (await db.prepare(`SELECT c.id, c.post_id, c.name, c.text, c.ts, c.by_hospital, p.title,
          (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes
        FROM post_comments c JOIN posts p ON p.id = c.post_id JOIN hospitals h ON h.id = p.hospital_id
        WHERE c.hidden = 0 AND c.ts > ? AND p.published = 1 AND p.hidden = 0 AND h.active = 1 AND ${NOT_PRIVATE}
        ORDER BY likes DESC, c.ts DESC LIMIT 8`).bind(nowMs() - 30 * 86400000).all()).results || [];
    } catch (e) {}
    return json({ items: rows.filter(r => r.likes > 0).map(r => ({ id: r.id, postId: r.post_id, title: r.title, name: r.name || '익명', text: r.text, ts: r.ts, likes: r.likes, byHospital: !!r.by_hospital })) }, 200, cors);
  }

  if (path === '/community/comment/delete' && method === 'POST') {
    const cmid = cleanId(body.cid);
    const u = await userOf();
    if (!u || !cmid) return LOGIN();
    const cid = u.key;
    const r = await db.prepare('DELETE FROM post_comments WHERE id = ? AND client_id = ? AND by_hospital = 0').bind(cmid, cid).run();
    // 지운 댓글에 달린 답글도 함께 지운다 — 남겨 두면 어디에 단 말인지 알 수 없다
    if (r.meta && r.meta.changes) { await db.prepare('DELETE FROM post_comments WHERE parent_id = ?').bind(cmid).run(); await db.prepare('DELETE FROM post_comment_likes WHERE comment_id = ?').bind(cmid).run().catch(() => {}); }
    return json({ ok: true, deleted: !!(r.meta && r.meta.changes) }, 200, cors);
  }

  // ══════════════ 상담소 (소장 앱) ══════════════
  if (path.startsWith('/hospital/')) {
    const h = await resolveHospital(db, { hsession: s(body.hsession || q('hsession'), 128), hcode: s(body.hcode || q('hcode'), 64) });
    if (!h) return json({ error: 'bad-code' }, 403, cors);

    // 받은 쪽지 — 회원이 상담소 페이지에서 보낸 것. 답장은 한 번(고쳐 쓰면 덮어쓴다).
    if (path === '/hospital/inquiries' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare('SELECT id, name, text, ts, reply, reply_ts FROM hospital_inquiries WHERE hospital_id = ? ORDER BY (reply IS NULL OR reply = \'\') DESC, ts DESC LIMIT 100').bind(h.id).all()).results || []; } catch (e) { if (!noTable(e)) throw e; }
      return json({ items: rows.map(r => ({ id: r.id, name: r.name || '회원', text: r.text, ts: r.ts, reply: r.reply || '', replyTs: r.reply_ts || 0 })) }, 200, cors);
    }
    if (path === '/hospital/inquiries/reply' && method === 'POST') {
      const id = cleanId(body.id), text = s(body.text, 1000).trim();
      if (!id || !text) return json({ error: 'missing' }, 400, cors);
      const r = await db.prepare('UPDATE hospital_inquiries SET reply = ?, reply_ts = ? WHERE id = ? AND hospital_id = ?').bind(text, nowMs(), id, h.id).run();
      if (!(r.meta && r.meta.changes)) return json({ error: 'not-found' }, 404, cors);
      return json({ ok: true, reply: text, replyTs: nowMs() }, 200, cors);
    }

    if (path === '/hospital/posts' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare(LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images') + ' WHERE p.hospital_id = ? ORDER BY p.pinned DESC, p.created DESC LIMIT 200').bind(h.id).all()).results || []; }
      catch (e) { if (noTable(e)) return json({ items: [], profile: profileOf(h), missing: true }, 200, cors); throw e; }
      return json({ ok: true, items: rows.map(r => rowPost(r, false)), profile: profileOf(h) }, 200, cors);
    }

    if (path === '/hospital/posts/save' && method === 'POST') {
      const it = body.post || {};
      const title = s(it.title, TITLE_MAX).trim(), text = s(it.body, BODY_MAX).trim();
      if (!title || !text) return json({ error: 'missing' }, 400, cors);
      const tags = tagsOf(it.tags).join(',');
      const published = it.published ? 1 : 0, pinned = it.pinned ? 1 : 0;
      const images = checkImages(it.images);
      if (!images) return json({ error: 'bad-image' }, 400, cors);
      const thumb = jpegOk(it.thumb, THUMB_BYTES) ? it.thumb : '';
      const imagesJson = images.length ? JSON.stringify(images) : null;
      let id = cleanId(it.id);
      if (id) {
        const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).first();
        if (!own) return json({ error: 'not-found' }, 404, cors);
        await db.prepare('UPDATE posts SET title = ?, body = ?, tags = ?, published = ?, pinned = ?, updated = ?, images = ?, thumb = ? WHERE id = ?')
          .bind(title, text, tags, published, pinned, nowMs(), imagesJson, thumb, id).run();
      } else {
        const today = await db.prepare('SELECT COUNT(*) n FROM posts WHERE hospital_id = ? AND created > ?').bind(h.id, nowMs() - 86400000).first();
        if ((today && today.n) >= POST_PER_DAY) return json({ error: 'too-many' }, 429, cors);
        id = rid('po');
        await db.prepare('INSERT INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, images, thumb) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)')
          .bind(id, h.id, title, text, tags, published, pinned, nowMs(), nowMs(), imagesJson, thumb).run();
      }
      const r = await db.prepare(LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images') + ' WHERE p.id = ?').bind(id).first();
      if (published) pingIndexNow(ctx, id, env);   // 네이버·빙에 새 글 주소를 알린다
      return json({ ok: true, post: rowPost(r, false) }, 200, cors);
    }

    if (path === '/hospital/posts/delete' && method === 'POST') {
      const id = cleanId(body.id);
      const r = await db.prepare('DELETE FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).run();
      if (r.meta && r.meta.changes) await db.batch([
        db.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(id),
        db.prepare('DELETE FROM post_comments WHERE post_id = ?').bind(id)
      ]);
      return json({ ok: true }, 200, cors);
    }

    if (path === '/hospital/comments' && method === 'GET') {
      const id = cleanId(q('id'));
      const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).first();
      if (!own) return json({ error: 'not-found' }, 404, cors);
      const cm = (await db.prepare(CM_SQL + ' WHERE c.post_id = ? ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || [];
      return json({ ok: true, comments: cm.map(rowComment) }, 200, cors);
    }

    if (path === '/hospital/comments/hide' && method === 'POST') {
      const cmid = cleanId(body.cid), hidden = body.hidden ? 1 : 0;
      await db.prepare(`UPDATE post_comments SET hidden = ? WHERE id = ? AND post_id IN (SELECT id FROM posts WHERE hospital_id = ?)`).bind(hidden, cmid, h.id).run();
      return json({ ok: true }, 200, cors);
    }

    // 상담소가 자기 글에 다는 답글 — 이용자 댓글과 같은 표에 by_hospital=1 로 둔다
    if (path === '/hospital/comments/reply' && method === 'POST') {
      const id = cleanId(body.id), text = s(body.text, COMMENT_MAX).trim();
      if (!id || !text) return json({ error: 'missing' }, 400, cors);
      const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).first();
      if (!own) return json({ error: 'not-found' }, 404, cors);
      const parent = await rootOf(id, cleanId(body.parentId));
      if (parent === null) return json({ error: 'not-found' }, 404, cors);
      const c = { id: rid('cm'), post_id: id, client_id: 'hosp:' + h.id, name: h.name, text, ts: nowMs(), hidden: 0, by_hospital: 1, parent_id: parent };
      await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital, parent_id) VALUES (?,?,?,?,?,?,0,1,?)')
        .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts, parent || null).run();
      return json({ ok: true, comment: rowComment(c) }, 200, cors);
    }

    if (path === '/hospital/profile' && method === 'POST') {
      const p = body.profile || {};
      const prof = { intro: s(p.intro, 600).trim(), tel: s(p.tel, 30).replace(/[^0-9-+ ]/g, '').trim(), addr: s(p.addr, 120).trim(),
        url: s(p.url, 200).trim(), hours: s(p.hours, 200).trim() };
      if (prof.url && !/^https?:\/\//i.test(prof.url)) prof.url = 'https://' + prof.url;
      await db.prepare('UPDATE hospitals SET profile = ? WHERE id = ?').bind(JSON.stringify(prof), h.id).run();
      return json({ ok: true, profile: prof }, 200, cors);
    }
    return null;
  }

  // ══════════════ 소속 상담사 (상담사 앱) ══════════════
  //  소속이 확인된(hospital_ok) 상담사만 쓴다 — 상담소 이름을 걸고 나가는 글이라, 소장이 받아들인 사람이어야 한다.
  if (path === '/pro/board/reply' && method === 'POST') {
    const me = await resolveCounselor(db, { session: s(body.session, 128), code: s(body.code, 64) });
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const id = cleanId(body.id), text = maskContact(s(body.text, 1000)).trim();
    if (!id || !text) return json({ error: 'missing' }, 400, cors);
    const p = await db.prepare("SELECT id FROM posts WHERE id = ? AND published = 1 AND hidden = 0 AND board IN ('free','neru','qna','meds','student','doctor','resident','expert','idea')").bind(id).first();
    if (!p) return json({ error: 'not-found' }, 404, cors);
    const parent = await rootOf(id, cleanId(body.parentId));
    if (parent === null) return json({ error: 'not-found' }, 404, cors);
    const cm = { id: rid('cm'), post_id: id, client_id: 'pro:' + me.id, name: s(me.name, 20) + ' 상담사', text, ts: nowMs(), hidden: 0, by_hospital: 1, parent_id: parent };
    await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital, parent_id) VALUES (?,?,?,?,?,?,0,1,?)')
      .bind(cm.id, cm.post_id, cm.client_id, cm.name, cm.text, cm.ts, parent || null).run();
    return json({ ok: true, comment: rowComment(cm) }, 200, cors);
  }

  if (path.startsWith('/pro/posts')) {
    const me = await resolveCounselor(db, { session: s(body.session || q('session'), 128), code: s(body.code || q('code'), 64) });
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    let c = null;
    try { c = await db.prepare('SELECT hospital_id, hospital_ok FROM counselors WHERE id = ?').bind(me.id).first(); } catch (e) {}
    const h = c && c.hospital_id && c.hospital_ok
      ? await db.prepare('SELECT id, name FROM hospitals WHERE id = ? AND active = 1').bind(c.hospital_id).first() : null;
    const MINE = LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images');

    if (path === '/pro/posts' && method === 'GET') {
      if (!h) return json({ ok: true, canWrite: false, pending: !!(c && c.hospital_id && !c.hospital_ok), items: [] }, 200, cors);
      const rows = (await db.prepare(MINE + ' WHERE p.hospital_id = ? AND p.author_id = ? ORDER BY p.created DESC LIMIT 100').bind(h.id, me.id).all()).results || [];
      return json({ ok: true, canWrite: true, hospital: { id: h.id, name: h.name }, items: rows.map(r => rowPost(r, false)) }, 200, cors);
    }
    if (!h) return json({ error: 'no-hospital' }, 403, cors);

    if (path === '/pro/posts/save' && method === 'POST') {
      const it = body.post || {};
      const title = s(it.title, TITLE_MAX).trim(), text = s(it.body, BODY_MAX).trim();
      if (!title || !text) return json({ error: 'missing' }, 400, cors);
      const tags = tagsOf(it.tags).join(',');
      const published = it.published ? 1 : 0;
      const images = checkImages(it.images);
      if (!images) return json({ error: 'bad-image' }, 400, cors);
      const thumb = jpegOk(it.thumb, THUMB_BYTES) ? it.thumb : '';
      const imagesJson = images.length ? JSON.stringify(images) : null;
      let id = cleanId(it.id);
      if (id) {
        const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ? AND author_id = ?').bind(id, h.id, me.id).first();
        if (!own) return json({ error: 'not-found' }, 404, cors);
        // 상단 고정(pinned)은 소장이 정한다 — 여기서는 건드리지 않는다
        await db.prepare('UPDATE posts SET title = ?, body = ?, tags = ?, published = ?, updated = ?, images = ?, thumb = ? WHERE id = ?')
          .bind(title, text, tags, published, nowMs(), imagesJson, thumb, id).run();
      } else {
        const day = nowMs() - 86400000;
        const mineN = await db.prepare('SELECT COUNT(*) n FROM posts WHERE author_id = ? AND created > ?').bind(me.id, day).first();
        const hospN = await db.prepare('SELECT COUNT(*) n FROM posts WHERE hospital_id = ? AND created > ?').bind(h.id, day).first();
        if ((mineN && mineN.n) >= AUTHOR_PER_DAY || (hospN && hospN.n) >= POST_PER_DAY) return json({ error: 'too-many' }, 429, cors);
        id = rid('po');
        await db.prepare('INSERT INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, images, thumb, author_id, author_name) VALUES (?,?,?,?,?,?,0,0,?,?,?,?,?,?)')
          .bind(id, h.id, title, text, tags, published, nowMs(), nowMs(), imagesJson, thumb, me.id, s(me.name, 40)).run();
      }
      const r = await db.prepare(MINE + ' WHERE p.id = ?').bind(id).first();
      if (published) pingIndexNow(ctx, id, env);
      return json({ ok: true, post: rowPost(r, false) }, 200, cors);
    }

    const ownPost = pid => db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ? AND author_id = ?').bind(pid, h.id, me.id).first();
    if (path === '/pro/posts/comments' && method === 'GET') {
      const id = cleanId(q('id'));
      if (!(await ownPost(id))) return json({ error: 'not-found' }, 404, cors);
      const cm = (await db.prepare(CM_SQL + ' WHERE c.post_id = ? ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || [];
      return json({ ok: true, comments: cm.map(rowComment) }, 200, cors);
    }
    if (path === '/pro/posts/reply' && method === 'POST') {
      const id = cleanId(body.id), text = maskContact(s(body.text, COMMENT_MAX)).trim();
      if (!id || !text) return json({ error: 'missing' }, 400, cors);
      if (!(await ownPost(id))) return json({ error: 'not-found' }, 404, cors);
      const parent = await rootOf(id, cleanId(body.parentId));
      if (parent === null) return json({ error: 'not-found' }, 404, cors);
      const c = { id: rid('cm'), post_id: id, client_id: 'pro:' + me.id, name: s(me.name, 20) + ' 상담사', text, ts: nowMs(), hidden: 0, by_hospital: 1, parent_id: parent };
      await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital, parent_id) VALUES (?,?,?,?,?,?,0,1,?)')
        .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts, parent || null).run();
      return json({ ok: true, comment: rowComment(c) }, 200, cors);
    }
    if (path === '/pro/posts/comments/hide' && method === 'POST') {
      const cmid = cleanId(body.cid), hidden = body.hidden ? 1 : 0;
      await db.prepare('UPDATE post_comments SET hidden = ? WHERE id = ? AND post_id IN (SELECT id FROM posts WHERE hospital_id = ? AND author_id = ?)').bind(hidden, cmid, h.id, me.id).run();
      return json({ ok: true }, 200, cors);
    }

    if (path === '/pro/posts/delete' && method === 'POST') {
      const id = cleanId(body.id);
      const r = await db.prepare('DELETE FROM posts WHERE id = ? AND hospital_id = ? AND author_id = ?').bind(id, h.id, me.id).run();
      if (r.meta && r.meta.changes) await db.batch([
        db.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(id),
        db.prepare('DELETE FROM post_comments WHERE post_id = ?').bind(id)
      ]);
      return json({ ok: true, deleted: !!(r.meta && r.meta.changes) }, 200, cors);
    }
    return null;
  }

  // ══════════════ 운영자 — 상담소 신청 심사 ══════════════
  if (path.startsWith('/admin/hospital-apps')) {
    if (!isAdmin(env, s(body.code || q('code'), 64))) return json({ error: 'bad-code' }, 403, cors);
    const rowApp = a => ({ id: a.id, name: a.name, doctor: a.doctor, email: a.email, tel: a.tel || '', addr: a.addr || '', bizno: a.bizno || '',
      dept: a.dept || '', intro: a.intro || '', hours: a.hours || '', url: a.url || '', hasDoc: !!a.doc, status: a.status, ts: a.ts, reason: a.reason || '', hospitalId: a.hospital_id || '' });
    if (path === '/admin/hospital-apps' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare('SELECT id, client_id, name, doctor, email, tel, addr, bizno, dept, intro, hours, url, (doc IS NOT NULL AND doc != \'\') AS doc, status, ts, reason, hospital_id FROM hospital_apps ORDER BY ts DESC LIMIT 200').all()).results || []; }
      catch (e) { if (noTable(e)) return json({ items: [], missing: true }, 200, cors); throw e; }
      return json({ items: rows.map(rowApp) }, 200, cors);
    }
    if (path === '/admin/hospital-apps/doc' && method === 'GET') {
      const a = await db.prepare('SELECT doc FROM hospital_apps WHERE id = ?').bind(cleanId(q('id'))).first();
      return json({ doc: (a && a.doc) || '' }, 200, cors);
    }
    if (path === '/admin/hospital-apps/approve' && method === 'POST') {
      const a = await db.prepare("SELECT * FROM hospital_apps WHERE id = ? AND status = 'pending'").bind(cleanId(body.id)).first();
      if (!a) return json({ error: 'not-found' }, 404, cors);
      // hospital.js 의 코드 규칙과 같다 (H-XXXX-XXXX)
      const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = new Uint8Array(8); crypto.getRandomValues(b);
      let code = 'H-'; for (let i = 0; i < 8; i++) { code += AB[b[i] % AB.length]; if (i === 3) code += '-'; }
      const hid = rid('hp');
      const profile = JSON.stringify({ intro: a.intro || '', tel: a.tel || '', addr: a.addr || '', url: a.url || '', hours: a.hours || '' });
      await db.batch([
        db.prepare('INSERT INTO hospitals (id, name, dept, doctor, email, code, active, created, profile, bizno) VALUES (?,?,?,?,?,?,1,?,?,?)')
          .bind(hid, a.name, a.dept || '심리상담', a.doctor, a.email, code, nowMs(), profile, a.bizno || ''),
        db.prepare("UPDATE hospital_apps SET status = 'approved', hospital_id = ?, decided = ? WHERE id = ?").bind(hid, nowMs(), a.id)
      ]);
      const docUrl = String(env.DOC_URL || 'https://doc.mindinsideapp.com').replace(/\/+$/, '');
      sendHtml(env, db, a.email, '[마인드 인사이드] 상담소 제휴가 승인됐습니다', mailWrap('마인드 인사이드', a.name + ' 제휴가 승인됐습니다', `
        <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">${a.doctor} 소장님, 환영합니다. 아래 순서로 시작하세요.</p>
        <div style="background:#f6f1e7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
          <p style="font-size:13px;line-height:1.9;color:#6b5f50;margin:0;">
            1. <a href="${docUrl}" style="color:#4f8a6b;font-weight:700;">소장 앱 ${docUrl.replace(/^https?:\/\//, '')}</a> 에서 이 이메일 주소로 로그인 링크를 받으세요<br>
            2. 상담소 코드: <b style="font-family:ui-monospace,monospace;font-size:16px;letter-spacing:.06em;">${code}</b><br>
            &nbsp;&nbsp;&nbsp;내담자에게 알려주면 앱 → 마이 → 담당 상담소 연결하기에 넣어 연결됩니다. 이 코드로는 소장 앱에 로그인할 수 없습니다(로그인은 1번의 이메일 링크로)<br>
            3. 소장 앱에서 상담소 페이지(소개·운영시간)를 확인하고, 소속 상담사의 등록을 안내해 주세요</p>
        </div>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">정산: 상담소 채널 상담료는 상담소 90% · 마인드 인사이드 7% · 결제 수수료 3%로 나뉘고, 소속 상담사에게는 상담소가 지급합니다.</p>
        <div style="background:#eef4ef;border-radius:12px;padding:14px 18px;margin:0 0 18px;">
          <p style="font-size:13px;font-weight:700;margin:0 0 6px;">제휴계약서를 첨부했습니다 — 회신 부탁드려요</p>
          <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0;">첨부한 심리상담사업자 제휴계약서를 읽어보시고, 동의하시면 <b>이 메일에 "동의합니다"라고 회신</b>해 주세요. 수정이 필요한 조항은 같은 메일로 알려주시면 협의합니다. 회신은 <a href="mailto:${OPS_REPLY}" style="color:#4f8a6b;">${OPS_REPLY}</a> 로 갑니다.</p>
        </div>
        <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">문의: <a href="mailto:mindinsideapp@gmail.com" style="color:#4f8a6b;">mindinsideapp@gmail.com</a></p>`),
        { replyTo: OPS_REPLY, attachments: [{ filename: '마인드인사이드_심리상담사업자_제휴계약서.docx', path: String(env.APP_URL || 'https://mindinsideapp.com').replace(/\/+$/, '') + '/legal/partner-agreement.docx' }] }).catch(() => {});
      return json({ ok: true, hospitalId: hid, code }, 200, cors);
    }
    if (path === '/admin/hospital-apps/reject' && method === 'POST') {
      const a = await db.prepare("SELECT * FROM hospital_apps WHERE id = ? AND status = 'pending'").bind(cleanId(body.id)).first();
      if (!a) return json({ error: 'not-found' }, 404, cors);
      const reason = s(body.reason, 300).trim();
      await db.prepare("UPDATE hospital_apps SET status = 'rejected', reason = ?, decided = ? WHERE id = ?").bind(reason, nowMs(), a.id).run();
      sendHtml(env, db, a.email, '[마인드 인사이드] 상담소 제휴 신청 결과', mailWrap('마인드 인사이드', a.name + ' 제휴 신청을 보류합니다', `
        <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">보내주신 신청을 검토했으나 이번에는 승인하지 못했습니다.${reason ? '<br><br><b>사유:</b> ' + reason.replace(/</g, '&lt;') : ''}</p>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">보완이 가능하면 다시 신청해 주세요. 문의: <a href="mailto:mindinsideapp@gmail.com" style="color:#4f8a6b;">mindinsideapp@gmail.com</a></p>`)).catch(() => {});
      return json({ ok: true }, 200, cors);
    }
    return null;
  }

  // ══════════════ 운영자 ══════════════
  if (path.startsWith('/admin/community')) {
    if (!isAdmin(env, s(body.code || q('code'), 64))) return json({ error: 'bad-code' }, 403, cors);
    if (path === '/admin/community' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare(LIST_SQL + ' ORDER BY p.created DESC LIMIT 300').all()).results || []; }
      catch (e) { if (noTable(e)) return json({ items: [], missing: true }, 200, cors); throw e; }
      return json({ items: rows.map(r => rowPost(r, false)) }, 200, cors);
    }
    if (path === '/admin/community/roles' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare("SELECT r.user_id, r.role, r.status, r.name, r.org, r.license_no, r.photo, r.requested, r.reason, u.email, u.provider FROM user_roles r LEFT JOIN users u ON u.id = r.user_id ORDER BY (r.status = 'pending') DESC, r.requested DESC LIMIT 200").all()).results || []; }
      catch (e) { if (noTable(e)) return json({ items: [], missing: true }, 200, cors); throw e; }
      return json({ items: rows.map(r => ({ userId: r.user_id, role: r.role, roleName: ROLE_NAME[r.role] || r.role, status: r.status, name: r.name, org: r.org || '', licenseNo: r.license_no || '', photo: r.status === 'pending' ? (r.photo || '') : '', ts: r.requested, reason: r.reason || '', email: r.email || '', provider: r.provider || '' })) }, 200, cors);
    }
    if (path === '/admin/community/role/decide' && method === 'POST') {
      const uid = cleanId(body.userId);
      // 심사가 끝나면 면허·자격증 사진은 지운다 — 더 가지고 있을 이유가 없다
      await db.prepare("UPDATE user_roles SET status = ?, reason = ?, decided = ?, photo = '' WHERE user_id = ?").bind(body.ok ? 'approved' : 'rejected', s(body.reason, 200), nowMs(), uid).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/admin/community/notice' && method === 'POST') {
      const title = s(body.title, TITLE_MAX).trim(), text = s(body.body, BODY_MAX).trim();
      if (!title || !text) return json({ error: 'missing' }, 400, cors);
      let id = cleanId(body.id);
      if (id) await db.prepare("UPDATE posts SET title = ?, body = ?, pinned = ?, updated = ? WHERE id = ? AND board = 'notice'").bind(title, text, body.pinned ? 1 : 0, nowMs(), id).run();
      else {
        id = rid('po');
        await db.prepare("INSERT INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, author_name, board) VALUES (?,?,?,?,'',1,?,0,?,?,'운영팀','notice')")
          .bind(id, SYS_HOSP, title, text, body.pinned ? 1 : 0, nowMs(), nowMs()).run();
      }
      return json({ ok: true, id }, 200, cors);
    }
    // 자료실 심사 — 올라온 파일 목록(파일 내용은 빼고), 열어 보기, 승인·삭제
    if (path === '/admin/community/library' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare("SELECT id, title, descr, who, uploader, size, status, ts, downloads FROM library_files ORDER BY (status = 'pending') DESC, ts DESC LIMIT 300").all()).results || []; } catch (e) { if (!noTable(e)) throw e; }
      return json({ items: rows.map(r => ({ id: r.id, title: r.title, desc: r.descr || '', who: r.who || '', uploader: r.uploader || '', size: r.size || 0, status: r.status, ts: r.ts, downloads: r.downloads || 0 })) }, 200, cors);
    }
    if (path === '/admin/community/library/file' && method === 'GET') {
      const r = await db.prepare('SELECT data FROM library_files WHERE id = ?').bind(cleanId(q('id'))).first();
      if (!r) return json({ error: 'not-found' }, 404, cors);
      return json({ ok: true, file: 'data:application/pdf;base64,' + r.data }, 200, cors);
    }
    if (path === '/admin/community/library/decide' && method === 'POST') {
      const id = cleanId(body.id);
      if (body.ok) await db.prepare("UPDATE library_files SET status = 'approved' WHERE id = ?").bind(id).run();
      else await db.prepare('DELETE FROM library_files WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, cors);
    }
    // 신고 목록 — 글·댓글별로 묶어서, 신고 수와 사유, 지금 가려졌는지
    if (path === '/admin/community/reports' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare("SELECT target, target_id, COUNT(*) AS n, MAX(ts) AS ts, GROUP_CONCAT(reason, ' / ') AS reasons FROM post_reports GROUP BY target, target_id ORDER BY ts DESC LIMIT 60").all()).results || []; }
      catch (e) { if (!noTable(e)) throw e; }
      const out = [];
      for (const r of rows) {
        const base = { target: r.target, n: r.n, ts: r.ts, reasons: s(String(r.reasons || '').replace(/( \/ )+/g, ' / ').replace(/^ \/ | \/ $/g, ''), 300) };
        if (r.target === 'comment') {
          const x = await db.prepare('SELECT c.id, c.post_id, c.name, c.text, c.hidden, p.title FROM post_comments c LEFT JOIN posts p ON p.id = c.post_id WHERE c.id = ?').bind(r.target_id).first();
          if (x) out.push(Object.assign(base, { id: x.id, postId: x.post_id, name: x.name || '', text: x.text, title: x.title || '', hidden: !!x.hidden }));
        } else {
          const x = await db.prepare('SELECT id, title, body, author_name, hidden FROM posts WHERE id = ?').bind(r.target_id).first();
          if (x) out.push(Object.assign(base, { id: x.id, postId: x.id, name: x.author_name || '', text: plainOf(x.body).slice(0, 300), title: x.title, hidden: !!x.hidden }));
        }
      }
      return json({ items: out }, 200, cors);
    }
    // 신고 정리 — 살펴본 뒤 문제없으면 신고 기록을 지운다(글·댓글은 그대로)
    if (path === '/admin/community/report/clear' && method === 'POST') {
      await db.prepare('DELETE FROM post_reports WHERE target = ? AND target_id = ?').bind(body.target === 'comment' ? 'comment' : 'post', cleanId(body.id)).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/admin/community/hide' && method === 'POST') {
      await db.prepare('UPDATE posts SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, cleanId(body.id)).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/admin/community/comment/hide' && method === 'POST') {
      await db.prepare('UPDATE post_comments SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, cleanId(body.cid)).run();
      return json({ ok: true }, 200, cors);
    }
  }
  return null;
}
