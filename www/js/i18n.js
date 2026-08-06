// ============================================================================
//  다국어 엔진 (한국어 기본 / English / 日本語)
//  · 라벨 몇 개가 아니라 '앱 전체'를 번역한다: 문서의 텍스트 노드를 사전으로
//    치환하고, 이후 동적으로 생기는 화면(모달·카드·리포트)도 감시해 번역한다.
//  · 챗봇 대화 언어·위트는 llm.js가 별도로 처리한다.
// ============================================================================
window.I18N = {
  lang() {
    return (window.Storage && window.Storage._safeGet('cbt_lang', 'ko')) || 'ko';
  },

  t(ko) {
    const m = this.map[this.lang()];
    return (m && m[ko]) || ko;
  },

  // 문서(또는 새로 생긴 노드)의 텍스트를 통째로 번역
  apply(root) {
    const L = this.lang();
    if (L === 'ko') return;
    const m = this.map[L];
    if (!m) return;
    root = root || document.body;
    if (!root) return;

    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => {
        const t = (n.nodeValue || '').trim();
        if (t && m[t]) n.nodeValue = n.nodeValue.replace(t, m[t]);
      });
      const scope = root.querySelectorAll ? root : document;
      scope.querySelectorAll('[placeholder]').forEach(el => {
        const p = el.getAttribute('placeholder');
        if (p && m[p]) { el.setAttribute('placeholder', m[p]); el.placeholder = m[p]; }
      });
      scope.querySelectorAll('[title]').forEach(el => {
        const t = el.getAttribute('title');
        if (t && m[t]) el.setAttribute('title', m[t]);
      });
    } catch (e) {}
  },

  // 이후에 생기는 화면(모달·리포트·카드)도 자동 번역
  observe() {
    if (this.lang() === 'ko' || this._obs) return;
    this._obs = new MutationObserver(muts => {
      muts.forEach(mu => {
        mu.addedNodes.forEach(n => {
          if (n.nodeType === 1) this.apply(n);
          else if (n.nodeType === 3) {
            const m = this.map[this.lang()];
            const t = (n.nodeValue || '').trim();
            if (m && t && m[t]) n.nodeValue = n.nodeValue.replace(t, m[t]);
          }
        });
      });
    });
    this._obs.observe(document.body, { childList: true, subtree: true });
  },

  map: {
    en: {
      // 내비게이션
      '홈': 'Home', '챗봇': 'Chat', '상담사 매칭': 'Counselors', '대시보드': 'Dashboard', '마이': 'My',
      // 홈
      '우렁의사 홈': 'Woorung Home',
      '나와 잘 맞는 상담사를 선택하고 대화를 시작해보세요': 'Pick the counselor that fits you and start talking',
      '24시간 실시간 상담': '24/7 live support', 'AI 심리상담 대화': 'AI Counseling Chat',
      '마음속 고민과 감정을 언제든 편하게 핑퐁 대화로 나눠보세요.': 'Share your worries and feelings anytime, back and forth like texting.',
      '대화 시작하기': 'Start talking', '전문 의료진 소속': 'Licensed professionals',
      '추천 전문 상담사': 'Recommended Counselors',
      '나에게 딱 맞는 검증된 전문 상담사를 찾고 예약을 진행하세요.': 'Find a verified counselor that fits you and book a session.',
      '상담사 둘러보기': 'Browse counselors', '내 마음 도구': 'My Mind Tools',
      '사고 기록': 'Thought Log', '생각 정리': 'Sort thoughts', '인지왜곡 학습': 'Thinking Traps', '10가지 함정': '10 traps',
      '마음 대시보드': 'Mind Dashboard', '감정 추적': 'Mood tracking',
      '추천 제휴 콘텐츠': 'Recommended Content', '마음 건강을 위한 맞춤형 정보': 'Curated picks for your mind',
      '우렁의사 앱 설치하기': 'Install the Woorung app', '홈 화면에 추가하고 더 빠르고 편하게 이용하세요!': 'Add to your home screen for quick access!',
      '앱 다운로드': 'Install app', '우렁의사 앱 다운로드': 'Get the Woorung App', '무료 앱 설치하기': 'Install free app', '다음에 할게요': 'Maybe later',
      // 챗봇
      '마음속 이야기를 편하게 적어주세요...': "Share what's on your mind...",
      '듣고 있어요… 편하게 말씀하세요': "Listening... speak freely",
      '바꾸기': 'Change', '초기화': 'Reset', '소리 켬': 'Sound on', '소리 끔': 'Sound off',
      'AI 상담사 선택': 'Choose your AI counselor', '함께할 AI 상담사를 골라주세요': 'Pick your AI counselor',
      '상담사마다 성격과 상담 스타일이 달라요. 지금 마음에 맞는 상담사를 골라보세요. 나눈 이야기와 기억은 모든 상담사가 함께 이어받습니다.': 'Each counselor has a different personality and style. Your stories and memories carry over between all of them.',
      '다시 묻지 않기 (챗봇을 열 때 이 창을 자동으로 띄우지 않아요. 바꾸고 싶을 땐 상단 [바꾸기] 버튼)': "Don't ask again (use the [Change] button anytime)",
      '닫기': 'Close', '● 현재 활성 상담사': '● Current counselor', '상담사 선택 ›': 'Select ›', '대화 계속하기 ›': 'Continue ›', '추천:': 'Best for:',
      // 페르소나
      '다정하고 능청스러운 동네 주치의': 'Warm, playfully witty family doctor',
      '생각의 그늘을 밝혀주는 인지치료 선생님': 'CBT teacher who shines light on dark thoughts',
      '못난 감정까지 다 받아주는 밤의 경청자': 'Night listener who accepts even your ugliest feelings',
      '느긋하고 단단한 마음챙김 선생님': 'Calm, steady mindfulness teacher',
      // 대시보드
      '감정 변화 추이와 인지왜곡 통합 리포트': 'Mood trends & thinking-trap reports',
      '오늘의 감정 흐름': "Today's Mood Flow", '이번 주 감정 흐름': "This Week's Mood",
      '인지왜곡 패턴': 'Thinking Traps', '활동 요약': 'Activity', '총 대화': 'Chats', '연속 일수': 'Streak', '발견한 왜곡': 'Traps found',
      '사고 기록지': 'Thought Log', '우렁이가 대화에서 정리해둔 마음 기록 보러가기': "See the records Woorungi kept from your chats",
      'AI 상담 요약 리포트': 'AI Session Reports', 'AI가 최근 대화를 읽고 핵심만 요약해드립니다.': 'AI reads your recent chats and sums up what matters.',
      '✨ + 오늘의 대화 요약 생성하기': "✨ + Summarize today's chats", '✨ 요약 다시 생성하기': '✨ Regenerate summary',
      '상세보기': 'Details', '접기': 'Collapse', '상담사에게 전송': 'Send to counselor', 'AI 생성': 'AI', '작성': '',
      '아직 데이터가 충분하지 않습니다': 'Not enough data yet', '대화를 시작하면 감정 변화를 추적할 수 있습니다': 'Start chatting to track your mood',
      // 기록
      '아직 사고 기록이 없습니다': 'No thought records yet', '대화 중 자동으로 생성되거나, 직접 작성할 수 있습니다': 'Created automatically from chats, or write your own',
      '+ 새 기록': '+ New', '샘플': 'Sample', 'AI 자동 기록': 'AI logged', '상황:': 'Situation:', '자동적 사고:': 'Automatic thought:', '대안적 사고:': 'Balanced thought:',
      // 마이페이지
      '마이페이지': 'My Page', '나의 상담 및 기록을 관리하세요': 'Manage your sessions and records',
      '내 이름(별명)': 'My name (nickname)', 'AI 상담사들이 당신을 이 이름으로 기억하고 불러드려요.': 'Your AI counselors will remember and call you by this name.',
      '저장': 'Save', '나의 상담 내역': 'My Sessions', '전체 내역 보기': 'View all', '예약 확정': 'Confirmed', '상담 완료': 'Completed', '예약 취소': 'Canceled',
      '⭐ 리뷰 남기기': '⭐ Write review', '다시 예약': 'Book again',
      '우렁이의 기억': "Woorungi's Memory", '걱정 마세요, 우렁이는 당신을 잊지 않아요.': "Don't worry — Woorungi never forgets you.",
      '대화를 지워도, 앱을 껐다 켜도, 리포트가 오래되어 정리돼도 — 당신과 나눈 이야기는 전부 우렁이의 기억 속에 그대로 있어요.': 'Even if chats are cleared, the app restarts, or old reports get tidied away — everything you shared stays safe in Woorungi\'s memory.',
      '기억 간직하기 (백업)': 'Keep memory (backup)', '기억 불러오기 (복원)': 'Restore memory',
      '앱 설정 및 데이터 관리': 'Settings & Data', '화면 테마 설정': 'Theme', '다크 모드와 라이트 모드를 전환합니다.': 'Switch between light and dark mode.',
      '테마 변경 🌙': 'Toggle 🌙', '전체화면 보기': 'Fullscreen', '화면을 꽉 채워 몰입해서 사용합니다.': 'Use the app in fullscreen.', '전체화면 ⛶': 'Fullscreen ⛶',
      '음성(TTS) 읽어주기': 'Voice replies (TTS)', 'AI 상담사의 답변을 음성으로 들려줍니다.': 'Hear your counselor speak the replies.',
      '목소리': 'Voice', '여성 목소리': 'Female voice', '남성 목소리': 'Male voice',
      '언어 / Language / 言語': 'Language', '챗봇 대화·위트가 선택한 언어로 바뀝니다.': 'The whole app and chat switch to this language.',
      '상담사가 먼저 말 걸기': 'Counselor checks in first',
      '지난 대화를 기억하고 친구처럼 먼저 안부를 물어요. ("우울한 건 좀 괜찮아?", "강아지랑 산책 갔다왔어?") 알림과 채팅으로 도착합니다.': 'They remember past chats and reach out like a friend. ("Feeling any better?", "Did you walk the dog?") Arrives as a notification and chat.',
      '안 함': 'Off', '하루 1번': '1× a day', '하루 2번': '2× a day', '하루 3번': '3× a day', '하루 5번': '5× a day',
      '랜덤 시간 (9시~21시)': 'Random (9am–9pm)', '정해진 시간': 'Fixed times',
      '⚠️ 전체 앱 데이터 초기화': '⚠️ Reset all app data', '🗑️ 앱 모든 데이터 초기화하기': '🗑️ Erase everything',
      // 비밀·감정 흐름
      '🔒 우렁이와의 비밀': "🔒 Just between you and Woorungi",
      '여기서 나눈 이야기는 오직 이 휴대폰 안에만 저장돼요. 어떤 서버에도 쌓이지 않고, 그 누구에게도 공유되지 않아요. 답변을 만드는 순간에만 안전하게 처리될 뿐, 흔적은 남지 않습니다. 당신과 우렁이, 둘만의 비밀이에요.': 'Everything you share stays only on this phone. Nothing piles up on any server, and no one else ever sees it. It is processed securely only for the moment a reply is made — no trace left. A secret between you and Woorungi.',
      '오늘 나눈 감정 이야기가 아직 적어요. 지금 기분을 이야기해보면 흐름이 그려져요.': "Not much feeling-talk today yet. Share how you feel and the flow will appear.",
      '아래에서 위로, 마음이 올라온 하루예요 ☀️': 'Your mood climbed up today ☀️',
      '마음이 조금 가라앉았네요. 우렁이가 곁에 있을게요 🌙': "Your mood dipped a bit. Woorungi is right here 🌙",
      '오늘은 대체로 편안하게 흘러갔어요 🍃': 'A mostly calm, easy day 🍃',
      '오늘은 마음이 묵직한 편이었어요. 잘 버텨냈어요 ☁️': 'A heavy-hearted day — you held on well ☁️',
      // 기타
      '이해했습니다, 시작하기': 'I understand, start', '도움이 필요하신가요?': 'Need help right now?', '대화 계속하기': 'Continue chat',
      // 홈: 체크인·미션·야간·도구
      '지금 마음은 어때요?': 'How are you feeling?',
      '기쁨': 'Joy', '편안': 'Calm', '보통': 'Okay', '불안': 'Anxious', '우울': 'Down',
      '🎯 오늘의 우렁 미션': "🎯 Today's Woorung Mission", '몸이 움직이면 마음이 따라와요': 'Move the body, the mind follows',
      '했어요! ✅': 'Done! ✅', '🔄 다른 거': '🔄 Another', '오늘 미션 완료!': 'Mission complete!',
      '움직임': 'Move', '즐거움': 'Joy', '연결': 'Connect', '돌봄': 'Care', '마음': 'Mind', '우렁이 맞춤': 'Picked for you',
      '🌙 오늘 하루, 정리하고 잘까요?': '🌙 Wrap up today before bed?',
      '자기 전 딱 3분, 우렁이가 오늘을 같이 돌아봐드려요': 'Just 3 minutes — Woorungi reviews the day with you',
      '하루 정리': 'Daily Wrap-up', '3분 회고': '3-min review', '마음 안정': 'Calm Down', '호흡·그라운딩': 'Breathing & grounding',
      // 대시보드 신규 카드
      '🗓️ 감정 캘린더': '🗓️ Mood Calendar', '날짜를 누르면 그날의 일기가 열려요': 'Tap a day to open its diary',
      '🌿 나의 마음 정원': '🌿 My Mind Garden', '나를 돌본 만큼 자라나요': 'It grows as you care for yourself',
      '💌 우렁이의 주간 편지': "💌 Woorungi's Weekly Letter",
      '일주일의 감정·기록을 모아 우렁이가 편지로 정리해드려요. (일요일 밤 추천)': 'Woorungi gathers your week into a letter. (Best on Sunday night)',
      '💌 이번 주 편지 받기': '💌 Get this week\'s letter', '💌 이번 주 편지 다시 쓰기': '💌 Rewrite this week\'s letter',
      '🌙 지난 밤들': '🌙 Past Nights', '자기 전 우렁이와 함께 정리한 하루들이에요.': 'Days you wrapped up with Woorungi before bed.',
      '오늘 정리하기': 'Wrap up today',
      // 마이페이지 신규
      '🏅 나의 꾸준함': '🏅 My Consistency', '💰 우렁 캐시': '💰 Woorung Cash', '🌱 우렁의사 구독': '🌱 Subscription',
      '충전 금액이 클수록 보너스 캐시가 커져요 🎁': 'Bigger top-ups earn bigger bonus cash 🎁',
      // 학습·퀴즈
      '우렁 선생님의 마음 수업': "Teacher Woorungi's Mind Class",
      '우렁 탐정의 생각 함정 찾기': "Detective Woorungi's Trap Hunt", '수사 시작하기 🔍': 'Start investigating 🔍',
      '다음 사건 ›': 'Next case ›', '다시 수사하기 🔍': 'Investigate again 🔍', '카드 다시 공부하기': 'Review the cards', '알겠어요': 'Got it',
      // 수면
      '수면 사운드': 'Sleep Sounds', '빗소리': 'Rain', '파도': 'Waves', '백색소음': 'White noise', '자동 끄기': 'Auto-off', '계속': 'Keep on',
      // 사고기록 위저드
      '무슨 일이 있었어요?': 'What happened?', '그때 마음은 어땠어요?': 'How did it feel?',
      '지금은 어때요?': 'How about now?', '기록 저장하기 ✓': 'Save record ✓', '기록 완료!': 'Saved!', '수정 완료!': 'Updated!',
      '💡 우렁이에게 힌트 받기': '💡 Get a hint from Woorungi', '다음 ›': 'Next ›', '‹ 이전': '‹ Back', '건너뛰기': 'Skip'
    },

    ja: {
      '홈': 'ホーム', '챗봇': 'チャット', '상담사 매칭': 'カウンセラー', '대시보드': 'ダッシュボード', '마이': 'マイ',
      '우렁의사 홈': 'ウロン先生 ホーム',
      '나와 잘 맞는 상담사를 선택하고 대화를 시작해보세요': '自分に合うカウンセラーを選んで話を始めましょう',
      '24시간 실시간 상담': '24時間リアルタイム相談', 'AI 심리상담 대화': 'AIカウンセリング',
      '마음속 고민과 감정을 언제든 편하게 핑퐁 대화로 나눠보세요.': '心の悩みや気持ちを、いつでも気軽にやり取りしましょう。',
      '대화 시작하기': '話しはじめる', '전문 의료진 소속': '医療機関所属の専門家',
      '추천 전문 상담사': 'おすすめカウンセラー',
      '나에게 딱 맞는 검증된 전문 상담사를 찾고 예약을 진행하세요.': '自分に合う認証済みカウンセラーを見つけて予約しましょう。',
      '상담사 둘러보기': 'カウンセラーを見る', '내 마음 도구': '心のツール',
      '사고 기록': '思考記録', '생각 정리': '考えの整理', '인지왜곡 학습': '認知のわな', '10가지 함정': '10のわな',
      '마음 대시보드': '心のダッシュボード', '감정 추적': '感情トラッキング',
      '추천 제휴 콘텐츠': 'おすすめコンテンツ', '마음 건강을 위한 맞춤형 정보': '心の健康のための情報',
      '우렁의사 앱 설치하기': 'アプリをインストール', '홈 화면에 추가하고 더 빠르고 편하게 이용하세요!': 'ホーム画面に追加して快適に！',
      '앱 다운로드': 'インストール', '우렁의사 앱 다운로드': 'ウロン先生アプリ', '무료 앱 설치하기': '無料でインストール', '다음에 할게요': 'また今度',
      '마음속 이야기를 편하게 적어주세요...': '心の中の話を気軽に書いてください…',
      '듣고 있어요… 편하게 말씀하세요': '聞いていますよ…気軽にどうぞ',
      '바꾸기': '変更', '초기화': 'リセット', '소리 켬': '音声ON', '소리 끔': '音声OFF',
      'AI 상담사 선택': 'AIカウンセラーを選ぶ', '함께할 AI 상담사를 골라주세요': 'AIカウンセラーを選んでください',
      '상담사마다 성격과 상담 스타일이 달라요. 지금 마음에 맞는 상담사를 골라보세요. 나눈 이야기와 기억은 모든 상담사가 함께 이어받습니다.': 'カウンセラーごとに性格とスタイルが違います。話した内容と記憶は全員に引き継がれます。',
      '다시 묻지 않기 (챗봇을 열 때 이 창을 자동으로 띄우지 않아요. 바꾸고 싶을 땐 상단 [바꾸기] 버튼)': '次から表示しない（変えたい時は上の[変更]ボタン）',
      '닫기': '閉じる', '● 현재 활성 상담사': '● 現在のカウンセラー', '상담사 선택 ›': '選択 ›', '대화 계속하기 ›': '続ける ›', '추천:': 'おすすめ:',
      '다정하고 능청스러운 동네 주치의': '優しくてお茶目な町のお医者さん',
      '생각의 그늘을 밝혀주는 인지치료 선생님': '思考のかげに光を当てるCBTの先生',
      '못난 감정까지 다 받아주는 밤の 경청자': 'どんな感情も受け止める夜の聞き役',
      '못난 감정까지 다 받아주는 밤의 경청자': 'どんな感情も受け止める夜の聞き役',
      '느긋하고 단단한 마음챙김 선생님': 'ゆったり穏やかなマインドフルネスの先生',
      '감정 변화 추이와 인지왜곡 통합 리포트': '感情の推移と認知のわなレポート',
      '오늘의 감정 흐름': '今日の気分の流れ', '이번 주 감정 흐름': '今週の気分の流れ',
      '인지왜곡 패턴': '認知のわな', '활동 요약': 'アクティビティ', '총 대화': '会話数', '연속 일수': '連続日数', '발견한 왜곡': '見つけたわな',
      '사고 기록지': '思考記録ノート', '우렁이가 대화에서 정리해둔 마음 기록 보러가기': 'ウロンギがまとめた記録を見る',
      'AI 상담 요약 리포트': 'AI相談サマリー', 'AI가 최근 대화를 읽고 핵심만 요약해드립니다.': 'AIが最近の会話を読んで要点をまとめます。',
      '✨ + 오늘의 대화 요약 생성하기': '✨ + 今日の会話をまとめる', '✨ 요약 다시 생성하기': '✨ もう一度まとめる',
      '상세보기': '詳細', '접기': '閉じる', '상담사에게 전송': 'カウンセラーへ送る', 'AI 생성': 'AI',
      '아직 데이터가 충분하지 않습니다': 'まだデータが足りません', '대화를 시작하면 감정 변화를 추적할 수 있습니다': '会話を始めると気分を記録できます',
      '아직 사고 기록이 없습니다': 'まだ記録がありません', '대화 중 자동으로 생성되거나, 직접 작성할 수 있습니다': '会話から自動で作られるか、自分で書けます',
      '+ 새 기록': '+ 新規', '샘플': 'サンプル', 'AI 자동 기록': 'AI記録', '상황:': '状況:', '자동적 사고:': '自動思考:', '대안적 사고:': 'バランス思考:',
      '마이페이지': 'マイページ', '나의 상담 및 기록을 관리하세요': '相談と記録を管理',
      '내 이름(별명)': '名前（ニックネーム）', 'AI 상담사들이 당신을 이 이름으로 기억하고 불러드려요.': 'AIカウンセラーがこの名前で呼びます。',
      '저장': '保存', '나의 상담 내역': '相談履歴', '전체 내역 보기': 'すべて見る', '예약 확정': '予約確定', '상담 완료': '完了', '예약 취소': 'キャンセル',
      '⭐ 리뷰 남기기': '⭐ レビューを書く', '다시 예약': '再予約',
      '우렁이의 기억': 'ウロンギの記憶', '걱정 마세요, 우렁이는 당신을 잊지 않아요.': '大丈夫、ウロンギはあなたを忘れません。',
      '대화를 지워도, 앱을 껐다 켜도, 리포트가 오래되어 정리돼도 — 당신과 나눈 이야기는 전부 우렁이의 기억 속에 그대로 있어요.': '会話を消しても、アプリを閉じても、古いレポートが整理されても — あなたと話したことは全部ウロンギの記憶に残っています。',
      '기억 간직하기 (백업)': '記憶を保管（バックアップ）', '기억 불러오기 (복원)': '記憶を戻す（復元）',
      '앱 설정 및 데이터 관리': '設定とデータ', '화면 테마 설정': 'テーマ', '다크 모드와 라이트 모드를 전환합니다.': 'ダーク/ライトを切り替え。',
      '테마 변경 🌙': '切り替え 🌙', '전체화면 보기': '全画面表示', '화면을 꽉 채워 몰입해서 사용합니다.': '全画面で集中して使えます。', '전체화면 ⛶': '全画面 ⛶',
      '음성(TTS) 읽어주기': '音声読み上げ（TTS）', 'AI 상담사의 답변을 음성으로 들려줍니다.': 'カウンセラーの返事を音声で。',
      '목소리': '声', '여성 목소리': '女性の声', '남성 목소리': '男性の声',
      '언어 / Language / 言語': '言語', '챗봇 대화·위트가 선택한 언어로 바뀝니다.': 'アプリとチャットがこの言語になります。',
      '상담사가 먼저 말 걸기': 'カウンセラーから声かけ',
      '지난 대화를 기억하고 친구처럼 먼저 안부를 물어요. ("우울한 건 좀 괜찮아?", "강아지랑 산책 갔다왔어?") 알림과 채팅으로 도착합니다.': '過去の会話を覚えて、友達のように声をかけます。（「気分は少し楽になった？」）通知とチャットで届きます。',
      '안 함': 'なし', '하루 1번': '1日1回', '하루 2번': '1日2回', '하루 3번': '1日3回', '하루 5번': '1日5回',
      '랜덤 시간 (9시~21시)': 'ランダム（9時〜21時）', '정해진 시간': '指定時刻',
      '⚠️ 전체 앱 데이터 초기화': '⚠️ 全データ初期化', '🗑️ 앱 모든 데이터 초기화하기': '🗑️ すべて消去する',
      '🔒 우렁이와의 비밀': '🔒 ウロンギとの秘密',
      '여기서 나눈 이야기는 오직 이 휴대폰 안에만 저장돼요. 어떤 서버에도 쌓이지 않고, 그 누구에게도 공유되지 않아요. 답변을 만드는 순간에만 안전하게 처리될 뿐, 흔적은 남지 않습니다. 당신과 우렁이, 둘만의 비밀이에요.': 'ここで話したことはこのスマホの中だけに保存されます。サーバーには残らず、誰にも共有されません。返事を作る瞬間だけ安全に処理され、痕跡は残りません。あなたとウロンギ、二人だけの秘密です。',
      '오늘 나눈 감정 이야기가 아직 적어요. 지금 기분을 이야기해보면 흐름이 그려져요.': '今日はまだ気持ちの話が少ないです。今の気分を話すと流れが描かれます。',
      '아래에서 위로, 마음이 올라온 하루예요 ☀️': '下から上へ、気分が上がった一日です ☀️',
      '마음이 조금 가라앉았네요. 우렁이가 곁에 있을게요 🌙': '少し沈んだ日でしたね。ウロンギがそばにいます 🌙',
      '오늘은 대체로 편안하게 흘러갔어요 🍃': '今日はおおむね穏やかな一日でした 🍃',
      '오늘은 마음이 묵직한 편이었어요. 잘 버텨냈어요 ☁️': '重たい心の日でした。よく耐えました ☁️',
      '이해했습니다, 시작하기': '理解しました、始める', '도움이 필요하신가요?': '助けが必要ですか？', '대화 계속하기': '会話を続ける',
      // 홈: 체크인·미션·야간·도구
      '지금 마음은 어때요?': '今の気分はどう？',
      '기쁨': 'うれしい', '편안': 'おだやか', '보통': 'ふつう', '불안': '不安', '우울': 'ゆううつ',
      '🎯 오늘의 우렁 미션': '🎯 今日のウロンミッション', '몸이 움직이면 마음이 따라와요': '体が動けば心もついてくる',
      '했어요! ✅': 'できた！✅', '🔄 다른 거': '🔄 別のを', '오늘 미션 완료!': 'ミッション達成！',
      '움직임': '運動', '즐거움': '楽しみ', '연결': 'つながり', '돌봄': 'ケア', '마음': 'こころ', '우렁이 맞춤': 'あなた専用',
      '🌙 오늘 하루, 정리하고 잘까요?': '🌙 今日を振り返って寝ましょうか？',
      '자기 전 딱 3분, 우렁이가 오늘을 같이 돌아봐드려요': '寝る前の3分、ウロンギが一日を一緒に振り返ります',
      '하루 정리': '一日のまとめ', '3분 회고': '3分の振り返り', '마음 안정': '心の応急処置', '호흡·그라운딩': '呼吸・グラウンディング',
      // 대시보드 신규 카드
      '🗓️ 감정 캘린더': '🗓️ 気分カレンダー', '날짜를 누르면 그날의 일기가 열려요': '日付をタップするとその日の日記が開きます',
      '🌿 나의 마음 정원': '🌿 心の庭', '나를 돌본 만큼 자라나요': '自分をケアした分だけ育ちます',
      '💌 우렁이의 주간 편지': '💌 ウロンギの週間レター',
      '일주일의 감정·기록을 모아 우렁이가 편지로 정리해드려요. (일요일 밤 추천)': '一週間の気持ちと記録をウロンギが手紙にまとめます。（日曜の夜がおすすめ）',
      '💌 이번 주 편지 받기': '💌 今週の手紙をもらう', '💌 이번 주 편지 다시 쓰기': '💌 今週の手紙を書き直す',
      '🌙 지난 밤들': '🌙 これまでの夜', '자기 전 우렁이와 함께 정리한 하루들이에요.': '寝る前にウロンギとまとめた日々です。',
      '오늘 정리하기': '今日をまとめる',
      // 마이페이지 신규
      '🏅 나의 꾸준함': '🏅 わたしの継続', '💰 우렁 캐시': '💰 ウロンキャッシュ', '🌱 우렁의사 구독': '🌱 サブスク',
      '충전 금액이 클수록 보너스 캐시가 커져요 🎁': 'チャージが大きいほどボーナスも大きい 🎁',
      // 학습·퀴즈
      '우렁 선생님의 마음 수업': 'ウロン先生の心の授業',
      '우렁 탐정의 생각 함정 찾기': 'ウロン探偵の思考のわな探し', '수사 시작하기 🔍': '捜査開始 🔍',
      '다음 사건 ›': '次の事件 ›', '다시 수사하기 🔍': 'もう一度捜査 🔍', '카드 다시 공부하기': 'カードを復習', '알겠어요': 'わかった',
      // 수면
      '수면 사운드': '睡眠サウンド', '빗소리': '雨の音', '파도': '波', '백색소음': 'ホワイトノイズ', '자동 끄기': '自動オフ', '계속': '続ける',
      // 사고기록 위저드
      '무슨 일이 있었어요?': '何がありましたか？', '그때 마음은 어땠어요?': 'その時どう感じましたか？',
      '지금은 어때요?': '今はどうですか？', '기록 저장하기 ✓': '記録を保存 ✓', '기록 완료!': '保存しました！', '수정 완료!': '更新しました！',
      '💡 우렁이에게 힌트 받기': '💡 ウロンギにヒントをもらう', '다음 ›': '次へ ›', '‹ 이전': '‹ 戻る', '건너뛰기': 'スキップ'
    }
  }
};
