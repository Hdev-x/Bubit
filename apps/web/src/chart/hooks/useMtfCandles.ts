import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndicatorSettings, TFKey } from '../overlays/ChartOverlay';
import type { Candle } from '../../shared/types/market';
import { loadWithTimeout } from './loadWithTimeout';

type LoadCandles = (granularity: string, limit: number, endTime?: string) => Promise<Candle[]>;
const TF_KEYS: TFKey[] = ['1M', '1W', '3D', '1D'];
const MTF_GRANULARITY: Record<TFKey, string> = { '1M': '1Mutc', '1W': '1Wutc', '3D': '3Dutc', '1D': '1Dutc' };
const hasEnabledIndicator = (settings: IndicatorSettings[TFKey]) => settings.showOB || settings.showOBBox || settings.showFVG || settings.showCE || settings.showEQ;
export const getMtfSettingsKey = (settings: IndicatorSettings) => TF_KEYS.filter((tf) => hasEnabledIndicator(settings[tf])).join('|');

export function useMtfCandles(symbol: string, indicatorSettings: IndicatorSettings, loadCandles: LoadCandles, atomic = false, key?: string) {
  const requestKey = key ?? symbol;
  const settingsKey = getMtfSettingsKey(indicatorSettings);
  const enabled = settingsKey ? settingsKey.split('|') as TFKey[] : [];
  const requestIdentity = `${atomic}|${requestKey}|${settingsKey}`;
  const [attempt, setAttempt] = useState({ identity: requestIdentity, version: 0 });
  if (attempt.identity !== requestIdentity) setAttempt({ identity: requestIdentity, version: attempt.version + 1 });
  const version = attempt.version;
  const retryMtf = useCallback(() => setAttempt((current) => ({ ...current, version: current.version + 1 })), []);
  const [state, setState] = useState<{ key: string | null; settingsKey: string; version: number; data: Partial<Record<TFKey, Candle[]>>; missing: TFKey[] }>({ key: null, settingsKey: '', version: -1, data: {}, missing: [] });
  const loadRef = useRef(loadCandles);
  const mobileCacheRef = useRef<{ key: string | null; loaded: Set<TFKey> }>({ key: null, loaded: new Set() });
  useEffect(() => { loadRef.current = loadCandles; }, [loadCandles]);

  let visibleState = state;
  if (!atomic && state.key !== requestKey) {
    visibleState = { key: requestKey, settingsKey, version, data: {}, missing: [] };
    setState(visibleState);
  } else if (atomic && enabled.length === 0 && (state.key !== requestKey || state.settingsKey !== settingsKey || state.version !== version || Object.keys(state.data).length > 0)) {
    visibleState = { key: requestKey, settingsKey, version, data: {}, missing: [] };
    setState(visibleState);
  }

  useEffect(() => {
    const controller = new AbortController();
    const requested = settingsKey ? settingsKey.split('|') as TFKey[] : [];
    if (!atomic && mobileCacheRef.current.key !== requestKey) mobileCacheRef.current = { key: requestKey, loaded: new Set() };
    if (requested.length === 0) return () => controller.abort();
    if (atomic) {
      Promise.all(requested.map(async (tf) => {
        try { return [tf, await loadWithTimeout(loadRef.current(MTF_GRANULARITY[tf], 300), controller.signal)] as const; }
        catch { return [tf, [] as Candle[]] as const; }
      })).then((results) => {
        if (controller.signal.aborted) return;
        const data: Partial<Record<TFKey, Candle[]>> = {};
        const missing: TFKey[] = [];
        for (const [tf, candles] of results) {
          if (candles.length) data[tf] = candles;
          else missing.push(tf);
        }
        setState({ key: requestKey, settingsKey, version, data, missing });
      });
      return () => controller.abort();
    }
    requested.forEach((tf) => {
      if (mobileCacheRef.current.loaded.has(tf)) return;
      loadRef.current(MTF_GRANULARITY[tf], 300).then((candles) => {
        if (controller.signal.aborted || !candles.length) return;
        mobileCacheRef.current.loaded.add(tf);
        setState((current) => current.key === requestKey ? { ...current, data: { ...current.data, [tf]: candles } } : current);
      }).catch(() => {});
    });
    return () => controller.abort();
  }, [requestKey, settingsKey, atomic, version]);

  const status = state.key === requestKey && state.settingsKey === settingsKey && state.version === version ? 'settled' : 'loading';
  return { mtfCandles: visibleState.data, mtfKey: visibleState.key, requestKey, settingsKey, status: status as 'loading' | 'settled', missing: status === 'settled' ? state.missing : enabled, retryMtf };
}
