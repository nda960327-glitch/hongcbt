// ============================================================================
//  기억 금고 (Memory Vault)
//  우렁의사가 쌓아온 장기기억·대화·기록 전체를 하나의 암호화 파일로 내보내고
//  다시 불러오는 모듈. 파일을 열어봐도 내용을 읽을 수 없도록 자체 규칙으로
//  암호화(XOR 롤링 키 + Base64 이중 인코딩)한다.
// ============================================================================
window.MemoryVault = {
  _MAGIC: "WRVAULT1",
  // 자체 난독화 키. 보안등급 암호화가 아니라 '사람이 열어봐도 못 읽게' 하는 봉인 목적.
  _KEY: "woorung-doctor-cbt-vault-2026-한마음",

  // --- 내부: 문자열 <-> 바이트, XOR, Base64 ---
  _xor(bytes) {
    const keyBytes = new TextEncoder().encode(this._KEY);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      // 롤링 키: 위치값을 섞어 단순 반복 패턴을 깨뜨린다
      out[i] = bytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 7 + 13) & 0xff);
    }
    return out;
  },

  _toBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  },

  _fromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },

  encrypt(text) {
    const plain = new TextEncoder().encode(text);
    const sealed = this._toBase64(this._xor(plain));
    // 64자 단위 줄바꿈: 파일을 열었을 때 더더욱 데이터 덩어리로만 보이게
    const wrapped = sealed.replace(/(.{64})/g, "$1\n");
    return this._MAGIC + "\n" + wrapped;
  },

  decrypt(payload) {
    const body = payload.replace(/\s+/g, "");
    if (!body.startsWith(this._MAGIC)) throw new Error("우렁의사 기억 파일이 아닙니다.");
    const b64 = body.slice(this._MAGIC.length);
    const bytes = this._xor(this._fromBase64(b64));
    return new TextDecoder().decode(bytes);
  },

  // --- 내보내기: 우렁의사의 모든 기억을 봉인해 다운로드 ---
  exportEncrypted() {
    if (!window.Storage) return;
    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      userMemory: window.Storage.getUserMemory(),          // 장기기억 (사례 기록)
      messages: window.Storage.getMessages(),               // 전체 대화
      thoughtRecords: window.Storage.getThoughtRecords(),   // 사고 기록
      moodEntries: window.Storage._safeGet("cbt_mood_entries", []),
      distortionStats: window.Storage.getDistortionStats(),
      activeDays: window.Storage._safeGet("cbt_active_days", []),
      totalSessions: window.Storage.getTotalSessions(),
      // 성장 시스템 (스트릭·뱃지·하루정리·체크인) — 이게 빠지면 "어제처럼 기억"이 깨진다
      moodLog: window.Storage._safeGet("cbt_mood_log", []),          // 원탭 기분 체크인
      nightJournal: window.Storage._safeGet("cbt_night_journal", []), // 오늘 하루 정리
      badges: window.Storage._safeGet("cbt_badges", {}),
      breathCount: window.Storage._safeGet("cbt_breath_count", 0),
      totalChats: window.Storage._safeGet("cbt_total_chats", 0),
      userName: window.Storage._safeGet("cbt_user_name", "")
    };

    const sealed = this.encrypt(JSON.stringify(snapshot));
    const dateStr = new Date().toISOString().split("T")[0];
    const blob = new Blob([sealed], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `우렁의사_기억_${dateStr}.wrmem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  },

  // --- 불러오기: 봉인 파일로 기억 복원 ---
  async importEncrypted(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(this.decrypt(text));
    } catch (e) {
      alert("기억 파일을 읽을 수 없습니다. 우렁의사에서 내려받은 파일이 맞는지 확인해주세요.");
      return false;
    }
    if (!data || data.version !== 1) {
      alert("지원하지 않는 기억 파일 형식입니다.");
      return false;
    }
    if (data.userMemory !== undefined) window.Storage.setUserMemory(data.userMemory);
    if (Array.isArray(data.messages)) window.Storage._safeSet("cbt_messages", data.messages);
    if (Array.isArray(data.thoughtRecords)) window.Storage._safeSet("cbt_thought_records", data.thoughtRecords);
    if (Array.isArray(data.moodEntries)) window.Storage._safeSet("cbt_mood_entries", data.moodEntries);
    if (data.distortionStats) window.Storage._safeSet("cbt_distortion_stats", data.distortionStats);
    if (Array.isArray(data.activeDays)) window.Storage._safeSet("cbt_active_days", data.activeDays);
    if (data.totalSessions !== undefined) window.Storage._safeSet("cbt_total_sessions", data.totalSessions);
    // 성장 시스템 (v1 파일에 없으면 조용히 건너뜀 — 구버전 백업과 호환)
    if (Array.isArray(data.moodLog)) window.Storage._safeSet("cbt_mood_log", data.moodLog);
    if (Array.isArray(data.nightJournal)) window.Storage._safeSet("cbt_night_journal", data.nightJournal);
    if (data.badges) window.Storage._safeSet("cbt_badges", data.badges);
    if (data.breathCount !== undefined) window.Storage._safeSet("cbt_breath_count", data.breathCount);
    if (data.totalChats !== undefined) window.Storage._safeSet("cbt_total_chats", data.totalChats);
    if (data.userName) window.Storage._safeSet("cbt_user_name", data.userName);
    alert("우렁의사의 기억이 복원되었습니다. 화면을 새로고침합니다.");
    location.reload();
    return true;
  }
};
