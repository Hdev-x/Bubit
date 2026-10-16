export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  changes: readonly string[];
};

export const releaseNotes: readonly ReleaseNote[] = [
  {
    version: '0.2.0',
    date: '2026-10-16',
    title: '업데이트 내역을 한눈에',
    changes: [
      '화면 아래 버전을 누르면 업데이트 내역을 확인할 수 있습니다.',
      '로그인 없이 최신 버전과 이전 변경 사항을 볼 수 있습니다.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-16',
    title: '실시간 시세와 계정 기능 개선',
    changes: [
      '현재가·캔들의 실시간 갱신과 종목·관심종목 목록의 표시 지연을 개선했습니다.',
      '프로필·Bitget API·모의투자 메뉴를 하나의 설정창에 모았습니다.',
      '전체 실시간 채팅에 댓글·좋아요·사진 첨부와 본인 글 수정·삭제를 연결했습니다.',
      '모의계좌 자산·포지션·주문창과 호가·커뮤니티 표시 설정을 제공합니다.',
      '모바일 시장·차트는 로그인 없이 볼 수 있고, 로그인 회원은 고급 지표·하모닉 분석을 사용할 수 있습니다.',
      'Bitget·Binance의 실시간 구독과 송출 범위를 줄여 서버 부하와 메시지 대기를 개선했습니다.',
    ],
  },
];
