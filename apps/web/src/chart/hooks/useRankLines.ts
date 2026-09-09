import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ChartOverlay } from '../overlays/ChartOverlay';

// ── 신뢰도 랭킹 선(임시 오버레이) — baseline_rank_{symbol}.json이 있을 때만 노출 ──
const RANK_TIERS = ['1M', '1W', '3D', '1d'] as const;
type RankLine = { price?: number; priceLo?: number; priceHi?: number; count?: number; score: number; from?: number };
// 오버레이 인스턴스별로 마지막 반영 키 — 오버레이 객체에 임의 필드를 붙이던 것을 WeakMap으로
const rankKeys = new WeakMap<ChartOverlay, { toggles: string; data: Record<string, RankLine[]> | null }>();

// MarketChart 전용 — 스캐너 산출 JSON을 읽어 체급별 신뢰선을 SMC 오버레이에 위임. MarketChart.tsx에서 옮김 .
export function useRankLines({ overlayRef, rankTiersOn, symbol }: {
  overlayRef: RefObject<ChartOverlay | null>;
  rankTiersOn: Record<string, boolean> | undefined;
  symbol: string | undefined;
}) {
  const [rankState, setRankState] = useState<{ symbol: string | undefined; data: Record<string, RankLine[]> | null }>({ symbol, data: null });
  const rankOn = rankTiersOn ?? {};
  if (rankState.symbol !== symbol) setRankState({ symbol, data: null });
  const rankData = rankState.symbol === symbol ? rankState.data : null;

  useEffect(() => {
    let alive = true;
    if (!symbol) return;
    fetch(`${import.meta.env.BASE_URL}baseline_rank_${symbol}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.tiers) setRankState({ symbol, data: j.tiers }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [symbol]);

  useEffect(() => {
    // 신뢰선 — SMC 오버레이 캔버스(ChartOverlay)에 위임. 좌표계·시작점 스냅·우측 라벨 전부 SMC와 동일.
    const ov = overlayRef.current;
    if (!ov) return;
    const toggles = JSON.stringify(rankOn);
    const previous = rankKeys.get(ov);
    if (previous?.toggles === toggles && previous.data === rankData) return;
    rankKeys.set(ov, { toggles, data: rankData });
    const list = !rankData
      ? []
      : RANK_TIERS.flatMap(tier =>
          rankOn[tier]
            ? (rankData[tier] ?? []).map(l => ({ tier, price: l.price, priceLo: l.priceLo, priceHi: l.priceHi, count: l.count, score: l.score, from: Number(l.from ?? 0) }))
            : []);
    ov.updateRankLines(list);
  });
}
