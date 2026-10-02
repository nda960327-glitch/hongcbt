// 커뮤니티의 '인증된 전문가' — 누가 비공개 라운지를 볼 수 있는가.
//
//  의사가 "환자 때문에 나도 무너질 것 같다"고 털어놓는 글, 상담사가 수입과 직장 이야기를 하는 글을
//  내담자가 읽게 되면 안 된다. 그래서 전문가 라운지는 인증된 사람에게만 보이고, 검색엔진에도 나가지 않는다.
//   · doctor   의사 라운지      — 정신건강의학과 전문의 · 전공의
//   · resident 전공의 라운지    — 전공의 · 전문의
//   · expert   상담사 라운지    — 심리상담사 · 임상심리사 · 상담소(소장)
//  인증되는 길
//   1) 상담사 앱·상담소 콘솔에 소셜 로그인을 연결한 계정(staff_links) → 자동으로 상담사/상담소
//   1-2) 이미 등록된 상담사·상담소와 이메일이 같거나, 같은 기기에서 낸 입점 신청이 승인된 계정 → 자동
//   2) 커뮤니티에서 인증 신청(면허·자격증 사진) → 운영자가 운영자 콘솔에서 확인하고 승인 (user_roles)
//  사진은 심사에만 쓰고, 승인·거절이 끝나면 지운다.
export const PRIVATE = {
  // 등록된 상담사·상담소도 의사·전공의 라운지를 본다(사장님 결정 2026-10-03). 글에는 '상담사'·'상담소' 표시가 붙어 누가 쓴 글인지 보인다.
  doctor: ['doctor', 'resident', 'counselor', 'clinic'],
  resident: ['doctor', 'resident', 'counselor', 'clinic'],
  expert: ['counselor', 'clinic']
};
export const PRIVATE_SQL = "('doctor','resident','expert')";
export const ROLE_NAME = { doctor: '정신건강의학과 전문의', resident: '전공의', counselor: '상담사', clinic: '상담소', super: '최고관리자' };
// 최고관리자 — 운영 DB 의 user_roles 에 role='super', status='approved' 로 직접 넣는다(신청으로는 될 수 없다). 모든 라운지를 보고, 어떤 글·댓글이든 지운다.
export const isSuper = roles => (roles || []).includes('super');
export const isPrivate = b => Object.prototype.hasOwnProperty.call(PRIVATE, b || '');
export const canSee = (board, roles) => !isPrivate(board) || (roles || []).some(r => PRIVATE[board].includes(r));

// 이 계정의 인증된 역할들
export async function rolesOf(db, userId) {
  if (!db || !userId) return [];
  const out = new Set();
  try {
    const r = await db.prepare("SELECT role FROM user_roles WHERE user_id = ? AND status = 'approved'").bind(userId).first();
    if (r && r.role === 'super') ['super', 'doctor', 'resident', 'counselor', 'clinic'].forEach(x => out.add(x));
    else if (r && r.role) out.add(r.role);
  } catch (e) {}
  try {
    const rs = (await db.prepare('SELECT role FROM staff_links WHERE user_id = ?').bind(userId).all()).results || [];
    rs.forEach(x => { if (x.role === 'counselor') out.add('counselor'); if (x.role === 'hospital') out.add('clinic'); });
  } catch (e) {}
  // 3) 이미 등록된 상담사·상담소 — 로그인 계정의 이메일이 등록된(운영팀이 승인한) 상담사·상담소의 이메일과 같거나,
  //    이 계정이 쓰는 앱 기기에서 낸 입점 신청이 승인돼 있으면 따로 신청하지 않아도 인증된 것으로 본다(사장님 결정 2026-10-03).
  try {
    const u = await db.prepare('SELECT lower(email) e FROM users WHERE id = ?').bind(userId).first();
    const e = u && u.e && u.e.indexOf('@') > 0 ? u.e : '';
    const r = await db.prepare(
      `SELECT (SELECT 1 FROM counselors WHERE active = 1 AND ? != '' AND lower(email) = ? LIMIT 1) c1,
              (SELECT 1 FROM applications a JOIN user_clients uc ON uc.client_id = a.client_id WHERE uc.user_id = ? AND a.status = 'approved' LIMIT 1) c2,
              (SELECT 1 FROM hospitals WHERE active = 1 AND ? != '' AND lower(email) = ? LIMIT 1) h1,
              (SELECT 1 FROM hospital_apps a JOIN user_clients uc ON uc.client_id = a.client_id WHERE uc.user_id = ? AND a.status = 'approved' LIMIT 1) h2`
    ).bind(e, e, userId, e, e, userId).first();
    if (r && (r.c1 || r.c2)) out.add('counselor');
    if (r && (r.h1 || r.h2)) out.add('clinic');
  } catch (e) {}
  return [...out];
}
