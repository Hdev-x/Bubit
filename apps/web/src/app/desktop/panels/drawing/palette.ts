// 드로잉 팔레트·선 굵기·선 스타일 상수 — ColorPicker.tsx에서 분리 (: 컴포넌트 파일은 컴포넌트만 export).

// ── 색 유틸 ──────────────────────────────────────────────
function mix(hex: string, target: number, ratio: number): string {
  // target: 255(밝게) 또는 0(어둡게), ratio 0~1
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const ch = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - ratio) + target * ratio);
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// TV식 팔레트 — 1행 그레이스케일, 2행 원색, 아래로 밝은/어두운 셰이드
const BASE_HUES = ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#009688', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'];
export const PALETTE: string[][] = [
  ['#ffffff', '#e1e1e1', '#c4c4c4', '#a6a6a6', '#898989', '#6b6b6b', '#4e4e4e', '#303030', '#131313', '#000000'],
  BASE_HUES,
  BASE_HUES.map((c) => mix(c, 255, 0.6)),
  BASE_HUES.map((c) => mix(c, 255, 0.35)),
  BASE_HUES.map((c) => mix(c, 0, 0.2)),
  BASE_HUES.map((c) => mix(c, 0, 0.4)),
];

// ── 공용 소품 ────────────────────────────────────────────
export const WIDTHS = [1, 2, 3, 4];
export const LINE_STYLES = [
  { v: 0, label: '실선', dash: 'none' },
  { v: 2, label: '대시', dash: '6,5' },
  { v: 1, label: '점선', dash: '2,3' },
];
