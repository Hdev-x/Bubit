import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMainTrade } from '../../../api/server/mainTradeApi';
import { fetchUsdKrwRate } from '../../../api/exchange/exchangeRate';
import { useSpotValueUsdt } from '../../../hooks/account/useSpotValueUsdt';
import { useDelayedReady } from '../../../hooks/ui/useDelayedReady';
import PullToRefresh from './PullToRefresh';
import { TotalAssetHero } from './TotalAssetHero';

const ASSET_REFRESH_MS = 10_000;

export default function MarketAssetSummary({ active }: { active: boolean }) {
  const [assetSummary, setAssetSummary] = useState({ totalAssetUsdt: 0, usdKrw: 1380 });
  const assetRequestGeneration = useRef(0);
  const fetchAssetSummary = useCallback(async () => {
    const [usdKrw, main] = await Promise.all([
      fetchUsdKrwRate(1380),
      fetchMainTrade().catch(() => null),
    ]);
    return {
      totalAssetUsdt: main?.hasKey ? main.equity : 0,
      usdKrw,
    };
  }, []);

  const refreshAssetSummary = useCallback(async () => {
    const generation = ++assetRequestGeneration.current;
    const summary = await fetchAssetSummary();
    if (active && generation === assetRequestGeneration.current) setAssetSummary(summary);
  }, [active, fetchAssetSummary]);

  useEffect(() => {
    if (!active) return; // 마켓 화면 밖이면 자산 요약 폴링 중단
    const requestGeneration = assetRequestGeneration;
    const load = () => {
      const generation = ++requestGeneration.current;
      return fetchAssetSummary().then((summary) => {
        if (generation === requestGeneration.current) setAssetSummary(summary);
      });
    };
    void load();
    const intervalId = window.setInterval(load, ASSET_REFRESH_MS);
    return () => {
      ++requestGeneration.current;
      window.clearInterval(intervalId);
    };
  }, [active, fetchAssetSummary]);

  const spot = useSpotValueUsdt(active);
  const baseAssetUsdt = assetSummary.totalAssetUsdt;
  const ready = useDelayedReady(baseAssetUsdt > 0 && spot.priced);

  return (
    <PullToRefresh onRefresh={refreshAssetSummary}>
      <section className="market-asset-summary">
        <TotalAssetHero totalUsdt={baseAssetUsdt + spot.value} ready={ready} label="총자산" />
      </section>
    </PullToRefresh>
  );
}
