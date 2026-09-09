// 드로잉 도구 카테고리 상수·타입 — DrawingSheet.tsx에서 분리 (: 컴포넌트 파일은 컴포넌트만 export).

export type DrawingTool = { type: string; name: string };
export type DrawingCategory = { id: string; name: string; tools: readonly DrawingTool[] };

export const DRAWING_CATEGORIES: DrawingCategory[] = [
  {
    id: 'line', name: '트렌드 라인',
    tools: [
      { type: 'trend-line',      name: '추세선' },
      { type: 'ray',             name: '레이' },
      { type: 'info-line',       name: '정보선' },
      { type: 'extended-line',   name: '연장선' },
      { type: 'trend-angle',     name: '트렌드 각도' },
      { type: 'horizontal-line', name: '수평선' },
      { type: 'horizontal-ray',  name: '수평 레이' },
      { type: 'vertical-line',   name: '수직선' },
      { type: 'cross-line',      name: '십자선' },
    ]
  },
  {
    id: 'channel', name: '채널',
    tools: [
      { type: 'parallel-channel',  name: '패럴렐 채널' },
      { type: 'regression-trend',  name: '회귀 추세' },
      { type: 'flat-top-bottom',   name: '수평 채널' },
      { type: 'disjoint-channel',  name: '분리 채널' },
    ]
  },
  {
    id: 'fibonacci', name: '간 및 피보나치',
    tools: [
      { type: 'fib-retracement',      name: '피보나치 되돌림' },
      { type: 'fib-extension',        name: '추세기반 피보나치 확장' },
      { type: 'fib-channel',          name: '피보나치 채널' },
      { type: 'fib-time-zone',        name: '피보나치 타임존' },
      { type: 'fib-speed-fan',        name: '피보나치 스피드팬' },
      { type: 'fib-time-extension',   name: '추세기반 피보나치 시간' },
      { type: 'fib-circles',          name: '피보나치 원' },
      { type: 'fib-spiral',           name: '피보나치 나선' },
      { type: 'fib-arcs',             name: '피보나치 호' },
      { type: 'fib-wedge',            name: '피보나치 쐐기' },
      { type: 'pitchfan',             name: '피치팬' },
      { type: 'gann-box',             name: '갠 박스' },
      { type: 'gann-fan',             name: '갠 팬' },
      { type: 'gann-square',          name: '갠 스퀘어' },
      { type: 'gann-square-fixed',    name: '갠 고정' },
    ]
  },
  {
    id: 'pitchfork', name: '포크',
    tools: [
      { type: 'andrews-pitchfork',        name: '앤드루스 포크' },
      { type: 'schiff-pitchfork',         name: '쉬프 포크' },
      { type: 'modified-schiff-pitchfork',name: '수정 쉬프 포크' },
      { type: 'inside-pitchfork',         name: '인사이드 포크' },
    ]
  },
  {
    id: 'pattern', name: '패턴',
    tools: [
      { type: 'bars-pattern',     name: '바 패턴' },
    ]
  },
  {
    id: 'forecasting', name: '예측 및 측정',
    tools: [
      { type: 'long-position',    name: '롱 포지션' },
      { type: 'short-position',   name: '숏 포지션' },
      { type: 'projection',       name: '투영' },
      { type: 'forecast',         name: '예측' },
      { type: 'price-range',      name: '가격 범위' },
      { type: 'date-range',       name: '날짜 범위' },
      { type: 'date-price-range', name: '날짜 및 가격 범위' },
    ]
  },
  {
    id: 'shape', name: '기하 도형',
    tools: [
      { type: 'rectangle',          name: '직사각형' },
      { type: 'circle',             name: '원' },
      { type: 'triangle',           name: '삼각형' },
      { type: 'ellipse',            name: '타원' },
      { type: 'arc',                name: '호' },
      { type: 'rotated-rectangle',  name: '회전 사각형' },
      { type: 'path',               name: '패스' },
      { type: 'polyline',           name: '폴리라인' },
      { type: 'curve',              name: '곡선' },
      { type: 'double-curve',       name: '이중 곡선' },
    ]
  },
  {
    id: 'annotation', name: '주석',
    tools: [
      { type: 'text-annotation',  name: '텍스트' },
      { type: 'callout',          name: '콜아웃' },
      { type: 'note',             name: '노트' },
      { type: 'price-note',       name: '가격 노트' },
      { type: 'price-label',      name: '가격 레이블' },
      { type: 'flag-mark',        name: '플래그' },
      { type: 'pin',              name: '핀' },
      { type: 'arrow-mark-up',    name: '↑ 마커' },
      { type: 'arrow-mark-down',  name: '↓ 마커' },
      { type: 'arrow-marker',     name: '화살표 마커' },
      { type: 'brush',            name: '브러시' },
      { type: 'highlighter',      name: '형광펜' },
      { type: 'comment',          name: '댓글' },
      { type: 'anchored-text',    name: '앵커 텍스트' },
    ]
  },
];
