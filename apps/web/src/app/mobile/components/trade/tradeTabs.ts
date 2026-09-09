// 거래 탭 종류·라벨 — TradeTabEditSheet.tsx에서 분리 (: 컴포넌트 파일은 컴포넌트만 export).

export type TradeTab = 'futures' | 'spot' | 'stock';

export const TAB_LABELS: Record<TradeTab, string> = {
  futures: 'Futures',
  spot: 'Spot',
  stock: 'Stock',
};
