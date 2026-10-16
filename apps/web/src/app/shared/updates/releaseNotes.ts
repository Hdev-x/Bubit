export type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  changes: readonly string[];
};

export const releaseNotes: readonly ReleaseNote[] = [
  {
    version: '0.2.1',
    date: '2026-10-16',
    title: '업데이트 내역 문구 정리',
    changes: [
      '업데이트 내역을 간결한 항목형 표현으로 통일',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-16',
    title: '업데이트 내역 팝업 추가',
    changes: [
      '푸터 버전 클릭 시 업데이트 내역 팝업 표시',
      '로그인 없이 버전별 변경 사항 열람 지원',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-16',
    title: '실시간 시세와 계정 기능 개선',
    changes: [
      '현재가·캔들 실시간 갱신 및 종목·관심종목 목록 표시 지연 개선',
      '프로필·Bitget API·모의투자 설정창 통합',
      '전체 실시간 채팅에 댓글·좋아요·사진 첨부 및 본인 글 수정·삭제 추가',
      '모의계좌 자산·포지션·주문창 및 호가·커뮤니티 표시 설정 추가',
      '모바일 시장·차트 비로그인 열람 및 로그인 회원의 고급 지표·하모닉 분석 지원',
      'Bitget·Binance 실시간 구독·송출 최적화로 서버 부하 및 메시지 지연 개선',
    ],
  },
];
