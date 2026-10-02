// 커뮤니티의 '인증된 전문가' — 누가 비공개 라운지를 볼 수 있는가.
//
//  의사가 "환자 때문에 나도 무너질 것 같다"고 털어놓는 글, 상담사가 수입과 직장 이야기를 하는 글을
//  내담자가 읽게 되면 안 된다. 그래서 전문가 라운지는 인증된 사람에게만 보이고, 검색엔진에도 나가지 않는다.
//   · doctor   의사 라운지      — 정신건강의학과 전문의 · 전공의
//   · resident 전공의 라운지    — 전공의 · 전문의
//   · expert   상담사 라운지    — 심리상담사 · 임상심리사 · 상담소(소장)
//  인증되는 길
//   1) 상담사 앱·상담소 콘솔에 소셜 로그인을 연결한 계정(staff_links) → 자동으로 상담사/상담소
//   2) 커뮤니티에서 인증 신청(면허·자격증 사진) → 운영자가 운영자 콘솔에서 확인하고 승인 (user_roles)
//  사진은 심사에만 쓰고, 승인·거절이 끝나면 지운다.
export const PRIVATE = {
  doctor: ['doctor', 'resident'],
  resident: ['doctor', 'resident'],
  expert: ['counselor', 'clinic']
};
export const PRIVATE_SQL = "('doctor','resident','expert')";
export const ROLE_NAME = { doctor: '정신건강의학과 전문의', resident: '전공의', counselor: '상담사', clinic: '상담소' };
export const isPrivate = b => Object.prototype.hasOwnProperty.call(PRIVATE, b || '');
export const canSee = (board, roles) => !isPrivate(board) || (roles || []).some(r => PRIVATE[board].includes(r));

// 이 계정의 인증된 역할들
export async function rolesOf(db, userId) {
  if (!db || !userId) return [];
  const out = new Set();
  try {
    const r = await db.prepare("SELECT role FROM user_roles WHERE user_id = ? AND status = 'approved'").bind(userId).first();
    if (r && r.role) out.add(r.role);
  } catch (e) {}
  try {
    const rs = (await db.prepare('SELECT role FROM staff_links WHERE user_id = ?').bind(userId).all()).results || [];
    rs.forEach(x => { if (x.role === 'counselor') out.add('counselor'); if (x.role === 'hospital') out.add('clinic'); });
  } catch (e) {}
  return [...out];
}
